import { randomUUID } from "node:crypto";
import { get, put } from "@vercel/blob";
import { processImageRequest } from "@/lib/process-image";
import { getPresets, getSettings, getModelProfiles } from "@/lib/server-store";
import { buildFinalPrompt } from "@/lib/final-prompt";
import { humanProfileHasFaceReferences, poseUsesVisibleFace } from "@/lib/model-shot";
import type { ActivePresetConfig } from "@/types";
import { JOB_TIMEOUT_MS, type IntegrationRequest } from "@/lib/integration-contract";

export interface Job {
  version: 1;
  jobId: string;
  requestHash: string;
  createdAt: number;
  product: IntegrationRequest["product"];
  images: { candidateId: string; sourceReference: string; filename: string; viewType: string }[];
}
interface ImageState { status: "processing" | "done" | "error"; resultUrl?: string; error?: string; cost?: number }
const root = (id: string) => `integration/v1/${id}`;
export async function readJson<T>(path: string): Promise<T | null> {
  const blob = await get(path, { access: "private", useCache: false });
  if (!blob) return null;
  return JSON.parse(await new Response(blob.stream).text()) as T;
}
export async function readJob(id: string) { return readJson<Job>(`${root(id)}/job.json`); }
export async function createJob(job: Job) {
  await put(`${root(job.jobId)}/job.json`, JSON.stringify(job), {
    access: "private", addRandomSuffix: false, allowOverwrite: false, contentType: "application/json",
  });
}
async function saveState(id: string, index: number, state: ImageState) {
  await put(`${root(id)}/state-${index}.json`, JSON.stringify(state), {
    access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
  });
}
export async function imageState(job: Job, index: number): Promise<ImageState | { status: "pending" }> {
  const state = await readJson<ImageState>(`${root(job.jobId)}/state-${index}.json`);
  if ((!state || state.status === "processing") && Date.now() - job.createdAt > JOB_TIMEOUT_MS)
    return { status: "error", error: "processing_interrupted" };
  return state ?? { status: "pending" };
}
export async function jobResponse(job: Job) {
  const images = await Promise.all(job.images.map(async (image, index) => {
    const state = await imageState(job, index);
    return { ...image, status: state.status,
      error: "error" in state ? state.error : null,
      cost: "cost" in state ? state.cost : null,
      downloadUrl: state.status === "done" ? `/api/integration/v1/jobs/${job.jobId}/images/${index}` : null };
  }));
  const complete = images.every((item) => item.status === "done" || item.status === "error");
  return { version: 1, jobId: job.jobId, product: job.product, complete,
    status: complete ? (images.every((item) => item.status === "done") ? "done" : "completed_with_errors") : "processing",
    pollAfterSeconds: complete ? null : 3, images };
}
export async function resolvePrompts(body: IntegrationRequest) {
  const [presets, settings, profiles] = await Promise.all([getPresets(), getSettings(), getModelProfiles()]);
  const preset = presets.find((item) => item.id === body.options.presetId);
  if (!preset?.polishedPrompt) throw new Error("preset_not_ready");
  const config: ActivePresetConfig = {
    presetId: preset.id, notes: body.options.notes ?? "", modelGender: "", modelBuild: "",
    modelWearerType: body.options.modelWearerType ?? "mens",
    modelPoseType: body.options.modelPoseType ?? "full_body",
    modelProfileId: body.options.modelProfileId ?? "",
    touchUpStrength: body.options.touchUpStrength ?? "standard",
    touchUpBackground: body.options.touchUpBackground ?? "standard_gray",
    backgroundMode: body.options.backgroundMode ?? "global",
  };
  if (preset.shotMode === "model") {
    const profile = profiles.find((item) => item.id === config.modelProfileId);
    if (!profile || profile.wearerType !== config.modelWearerType) throw new Error("invalid_model_profile");
    if (profile.kind === "human" && poseUsesVisibleFace(config.modelPoseType) && !humanProfileHasFaceReferences(profile))
      throw new Error("model_face_references_required");
  }
  const prompts = body.images.map((image) => buildFinalPrompt(preset, config, {
    allProfiles: profiles, background: settings.background, brandRules: settings.brandRules,
    productGroupId: body.product.reference, productGroupLabel: body.product.reference, viewType: image.viewType,
  })!);
  return { prompts, config, shotMode: preset.shotMode, settings };
}
export async function runJob(body: IntegrationRequest, resolved: Awaited<ReturnType<typeof resolvePrompts>>) {
  // Four independent images run once. Blob records outlive the server process; no automatic paid retries.
  await Promise.allSettled(body.images.map(async (image, index) => {
    try {
      await saveState(body.requestId, index, { status: "processing" });
      const ext = image.contentType === "image/jpeg" ? "jpeg" : image.contentType === "image/webp" ? "webp" : "png";
      const source = await put(`${root(body.requestId)}/source-${index}.${ext}`, Buffer.from(image.dataBase64, "base64"), {
        access: "private", addRandomSuffix: false, contentType: image.contentType,
      });
      const response = await processImageRequest(new Request("http://internal/process", {
        method: "POST", body: JSON.stringify({
          folder: `${root(body.requestId)}/output-${index}`, photoId: randomUUID(),
          sourceUrl: source.url, prompt: resolved.prompts[index], shotMode: resolved.shotMode,
          modelProfileId: resolved.config.modelProfileId, modelPoseType: resolved.config.modelPoseType,
          viewType: image.viewType, imageSize: resolved.settings.imageSize,
          imageQuality: resolved.settings.imageQuality, outputFormat: resolved.settings.outputFormat,
        }),
      }), AbortSignal.timeout(240_000));
      if (!response.ok) throw new Error("generation_failed");
      const result = await response.json();
      // Store the private storage URL internally; clients receive only the authenticated download route.
      const resultUrl = new URL(result.resultUrl, "http://internal").searchParams.get("url");
      if (!resultUrl) throw new Error("generation_failed");
      await saveState(body.requestId, index, { status: "done", resultUrl, cost: result.cost });
    } catch {
      await saveState(body.requestId, index, { status: "error", error: "generation_failed" });
    }
  }));
}
