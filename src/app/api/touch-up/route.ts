import { NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";
import { saveFile } from "@/lib/file-utils";
import { completeImageHistoryItem, getImageHistoryItem } from "@/lib/image-history";
import { readBlob, blobServingUrl } from "@/lib/blob-utils";
import { cleanFolder, cleanPathSegment, isRecord, readImageOptions } from "@/lib/validation";
import { list } from "@vercel/blob";
import { getModelProfiles } from "@/lib/server-store";
import {
  getModelProfile,
  STARTER_MODEL_PROFILES,
  humanProfileHasFaceReferences,
  getModelShotContext,
  modelShotContextGuidance,
  type ModelFaceReference,
} from "@/lib/model-shot";
import { selectModelVariation, modelVariationGuidance, type ModelGeneration } from "@/lib/model-expression";
import type { ModelPoseType } from "@/types";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const INPUT_IMAGE_RATE = 8.0 / 1_000_000;
const INPUT_TEXT_RATE = 5.0 / 1_000_000;
const OUTPUT_IMAGE_RATE = 30.0 / 1_000_000;

function estimateCost(usage: Record<string, unknown> | undefined | null): number {
  if (!usage) return 0;
  const details = usage.input_tokens_details as
    | { image_tokens?: number; text_tokens?: number }
    | undefined;
  const imageIn = details?.image_tokens ?? 0;
  const textIn = details?.text_tokens ?? 0;
  const outputTokens = (usage.output_tokens as number) ?? 0;
  return imageIn * INPUT_IMAGE_RATE + textIn * INPUT_TEXT_RATE + outputTokens * OUTPUT_IMAGE_RATE;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl : undefined;
    const folder = cleanFolder(body.folder);
    const photoId = typeof body.photoId === "string" ? body.photoId : "";
    const label = cleanPathSegment(body.label, "");
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const requestModelProfileId = typeof body.modelProfileId === "string" ? body.modelProfileId : "";
    const requestModelPoseType = cleanModelPoseType(body.modelPoseType);
    const { imageSize, imageQuality, outputFormat } = readImageOptions(body);

    if (!folder || !photoId || !prompt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (prompt.length > 8000) {
      return NextResponse.json({ error: "Prompt exceeds 8000 characters. Shorten the preset or notes so all shot instructions can be preserved." }, { status: 400 });
    }

    const subfolder = label ? `${folder}/${label}` : folder;
    const source = await resolveSourceImage(sourceUrl, subfolder, photoId);
    if (!source) {
      return NextResponse.json(
        { error: "Source image not found" },
        { status: 404 }
      );
    }

    const sourceBlob = await readBlob(source.url).catch(() => null);
    if (!sourceBlob) {
      return NextResponse.json(
        { error: "Source image not readable" },
        { status: 404 }
      );
    }

    const imageBuffer = new Uint8Array(sourceBlob.buffer);
    const ext = source.ext;
    const imageFile = new File([imageBuffer], `source.${ext}`, {
      type: MIME[ext] || "image/png",
    });
    const inputImages: File[] = [imageFile];
    const historyItem = await getImageHistoryItem(photoId);
    const shotMode = body.shotMode ?? historyItem?.usedSettings.shotMode;
    const modelProfileId = shotMode === "model"
      ? (requestModelProfileId || historyItem?.usedSettings.modelProfileId || "") : "";
    if (shotMode === "model" && !modelProfileId) {
      return NextResponse.json({ error: "Select a model profile before generating." }, { status: 400 });
    }
    const modelPoseType = requestModelPoseType ?? historyItem?.usedSettings.modelPoseType ?? "upper_face_visible";
    const viewType = typeof body.viewType === "string" ? body.viewType : historyItem?.usedSettings.viewType;
    const faceReferences = await resolveHumanFaceReferences(modelProfileId, modelPoseType, viewType, historyItem?.lastModelGeneration);

    if (faceReferences.status === "missing-profile") {
      return NextResponse.json({ error: "The selected model no longer exists. Select another model." }, { status: 400 });
    }
    if (faceReferences.status === "missing-required") {
      return NextResponse.json(
        { error: "This human model profile needs 1-12 readable face reference images before generating a face-visible model shot." },
        { status: 400 }
      );
    }

    inputImages.push(...faceReferences.files);
    const generationPrompt = [
      prompt,
      faceReferences.generation ? modelVariationGuidance(faceReferences.generation, modelPoseType, viewType) : "",
      // Repeat the resolved constraints last so saved legacy prompts cannot control crop/view.
      shotMode === "model" ? modelShotContextGuidance(modelPoseType, viewType) : "",
    ].filter(Boolean).join("\n\n");

    const format = outputFormat;
    const quality = imageQuality;

    const openai = getOpenAIClient();
    const editParams = {
      model: "gpt-image-2",
      image: inputImages.length === 1 ? inputImages[0] : inputImages,
      prompt: generationPrompt,
      n: 1,
      size: imageSize as "1024x1024" | "1536x1024" | "1024x1536",
      quality: quality as "low" | "medium" | "high" | "auto",
      output_format: format as "png" | "jpeg" | "webp",
    };
    // The SDK accepts a single File or an array, matching the Images edit API's image[] form field.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await openai.images.edit(editParams as any);

    const imageData = response.data?.[0];
    if (!imageData?.b64_json) {
      return NextResponse.json({ error: "No image returned from OpenAI" }, { status: 500 });
    }

    const resultBuffer = Buffer.from(imageData.b64_json, "base64");
    const resultFilename = `result_${photoId.slice(0, 8)}.${format}`;
    const resultUrl = await saveFile(subfolder, resultFilename, resultBuffer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usage = (response as any).usage ?? null;
    const cost = estimateCost(usage);
    const tokenUsage = usage
      ? {
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          totalTokens: usage.total_tokens ?? 0,
        }
      : null;

    await completeImageHistoryItem({
      id: photoId,
      resultUrl,
      cost,
      usage: tokenUsage,
      label: label || undefined,
      batchFolder: folder,
      lastModelGeneration: faceReferences.generation,
    });

    return NextResponse.json({
      resultUrl: `${blobServingUrl(resultUrl)}&t=${Date.now()}`,
      usage: tokenUsage,
      cost,
    });
  } catch (err) {
    console.error("Touch-up error:", err);
    const msg = err instanceof Error ? err.message : "Touch-up failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function resolveSourceImage(
  sourceUrl: string | undefined,
  subfolder: string,
  photoId: string
): Promise<{ url: string; ext: string } | null> {
  if (typeof sourceUrl === "string" && sourceUrl.startsWith("http")) {
    return imageSource(sourceUrl);
  }

  const historyItem = await getImageHistoryItem(photoId);
  if (historyItem?.sourceUrl) {
    return imageSource(historyItem.sourceUrl);
  }

  const prefix = `${subfolder}/source_${photoId.slice(0, 8)}`;
  const blobs = await list({ prefix });
  const sourceBlob = blobs.blobs[0];
  if (!sourceBlob) return null;

  return {
    url: sourceBlob.url,
    ext: sourceBlob.pathname.split(".").pop()?.toLowerCase() || "png",
  };
}

function imageSource(url: string): { url: string; ext: string } {
  const pathname = new URL(url).pathname;
  return {
    url,
    ext: pathname.split(".").pop()?.toLowerCase() || "png",
  };
}

function cleanModelPoseType(value: unknown): ModelPoseType | undefined {
  return value === "full_body" ||
    value === "upper_face_visible" ||
    value === "upper_no_face" ||
    value === "lower_no_face"
    ? value
    : undefined;
}

async function resolveHumanFaceReferences(
  modelProfileId: string,
  modelPoseType: ModelPoseType | undefined,
  viewType: string | undefined,
  previous?: ModelGeneration,
): Promise<{
  status: "none" | "ready" | "missing-required" | "missing-profile";
  files: File[];
  generation?: ModelGeneration;
}> {
  if (!modelProfileId) return { status: "none", files: [] };
  const profiles = await getModelProfiles();
  const profile = getModelProfile(modelProfileId, profiles) ?? getModelProfile(modelProfileId, STARTER_MODEL_PROFILES);
  if (!profile) return { status: "missing-profile", files: [] };
  if (!getModelShotContext(modelPoseType, viewType).usesFace) return { status: "none", files: [] };
  if (profile.kind !== "human") {
    return { status: "ready", files: [], generation: selectModelVariation(profile, [], previous).generation };
  }
  if (!humanProfileHasFaceReferences(profile)) return { status: "missing-required", files: [] };

  // Try only selected references first. Replace unreadable files before choosing again.
  let available = [...(profile.faceReferences ?? [])];
  const loaded = new Map<string, File>();
  while (available.length) {
    const variation = selectModelVariation(profile, available, previous);
    const missing = new Set<string>();
    await Promise.all(variation.references.map(async (reference, index) => {
      if (loaded.has(reference.id)) return;
      const file = await referenceToFile(reference, index);
      if (file) loaded.set(reference.id, file);
      else missing.add(reference.id);
    }));
    if (!missing.size) return {
      status: "ready",
      files: variation.references.map((r) => loaded.get(r.id)!),
      generation: variation.generation,
    };
    available = available.filter((r) => !missing.has(r.id));
  }
  return { status: "missing-required", files: [] };
}

async function referenceToFile(reference: ModelFaceReference, index: number): Promise<File | null> {
  const blob = await readBlob(reference.url).catch(() => null);
  if (!blob) return null;

  const ext = reference.name.split(".").pop()?.toLowerCase() || "png";
  const mime = blob.contentType || reference.contentType || MIME[ext] || "image/png";
  return new File([new Uint8Array(blob.buffer)], `face-reference-${index + 1}.${ext}`, {
    type: mime,
  });
}
