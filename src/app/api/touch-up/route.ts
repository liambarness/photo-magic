import { NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";
import { saveFile } from "@/lib/file-utils";
import { completeImageHistoryItem, getImageHistoryItem } from "@/lib/image-history";
import { readBlob, blobServingUrl } from "@/lib/blob-utils";
import { cleanFolder, cleanPathSegment, isRecord, readImageOptions } from "@/lib/validation";
import { list } from "@vercel/blob";
import { getModelProfiles } from "@/lib/server-store";
import {
  STARTER_MODEL_PROFILES,
  getModelProfile,
  humanProfileHasFaceReferences,
  poseUsesVisibleFace,
  type ModelFaceReference,
} from "@/lib/model-shot";
import type { GenerationDebug, ModelPoseType } from "@/types";

const MIME: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const INPUT_IMAGE_RATE = 8.0 / 1_000_000;
const INPUT_TEXT_RATE = 5.0 / 1_000_000;
const OUTPUT_IMAGE_RATE = 30.0 / 1_000_000;
const HUMAN_FACE_REPLACEMENT_INSTRUCTION =
  "Human face reference workflow: input image 1 is the product/source image. The additional attached images are face references for the selected human model. If input image 1 already contains a person or model wearing the product, treat this as an identity-replacement edit: replace that person's facial identity with the selected human model's face from the references while preserving the garment/product, pose, body framing, visible body extent, subject scale, canvas composition, product fit, logo placement, artwork, colors, camera angle, and background from input image 1. In that source-person case, the selected model pose controls face visibility only; it must not override the source crop, zoom level, pose, or visible body extent. Do not zoom out, reframe, convert an upper-body source crop into a full-body shot, or add legs, feet, shoes, hands, or body areas that are not visible in input image 1. If input image 1 is product-only or does not show a person wearing the product, generate the selected model shot normally and use the face references only for identity. Do not preserve the source person's original face. Do not copy clothing, background, pose, lighting, or camera angle from the face reference images.";

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
    const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 8000) : "";
    const requestModelProfileId = typeof body.modelProfileId === "string" ? body.modelProfileId : "";
    const requestModelPoseType = cleanModelPoseType(body.modelPoseType);
    const { imageSize, imageQuality, outputFormat } = readImageOptions(body);

    if (!folder || !photoId || !prompt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
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
    const modelProfileId = requestModelProfileId || historyItem?.usedSettings.modelProfileId || "";
    const modelPoseType = requestModelPoseType ?? historyItem?.usedSettings.modelPoseType;
    const faceReferences = await resolveHumanFaceReferences(modelProfileId, modelPoseType);

    if (faceReferences.status === "missing-profile") {
      return NextResponse.json(
        { error: "Selected model profile was not found. Save the model profile again before generating." },
        { status: 400 }
      );
    }

    if (faceReferences.status === "missing-required") {
      return NextResponse.json(
        { error: "This human model profile needs 1-4 face reference images before generating a face-visible model shot." },
        { status: 400 }
      );
    }

    inputImages.push(...faceReferences.files);
    const effectivePrompt =
      faceReferences.files.length > 0
        ? `${prompt} ${HUMAN_FACE_REPLACEMENT_INSTRUCTION}`
        : prompt;
    const generationDebug: GenerationDebug = {
      modelProfileId: modelProfileId || undefined,
      modelProfileName: faceReferences.modelProfileName,
      modelProfileKind: faceReferences.modelProfileKind,
      modelPoseType,
      faceReferenceCount: faceReferences.files.length,
      inputImageCount: inputImages.length,
    };

    const format = outputFormat;
    const quality = imageQuality;

    const openai = getOpenAIClient();
    const editParams = {
      model: "gpt-image-2",
      image: inputImages.length === 1 ? inputImages[0] : inputImages,
      prompt: effectivePrompt,
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
      generationDebug,
      label: label || undefined,
      batchFolder: folder,
    });

    return NextResponse.json({
      resultUrl: `${blobServingUrl(resultUrl)}&t=${Date.now()}`,
      usage: tokenUsage,
      cost,
      generationDebug,
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
  modelPoseType: ModelPoseType | undefined
): Promise<
  | { status: "none"; files: File[]; modelProfileKind: "none"; modelProfileName?: string }
  | { status: "ready"; files: File[]; modelProfileKind: "human"; modelProfileName: string }
  | { status: "missing-profile"; files: File[]; modelProfileKind: "missing"; modelProfileName?: string }
  | { status: "missing-required"; files: File[]; modelProfileKind: "human"; modelProfileName: string }
  | { status: "none"; files: File[]; modelProfileKind: "ai"; modelProfileName: string }
> {
  if (!modelProfileId || !poseUsesVisibleFace(modelPoseType)) {
    return { status: "none", files: [], modelProfileKind: "none" };
  }

  const profiles = [...STARTER_MODEL_PROFILES, ...(await getModelProfiles())];
  const profile = getModelProfile(modelProfileId, profiles);
  if (!profile) {
    return { status: "missing-profile", files: [], modelProfileKind: "missing" };
  }
  if (profile?.kind !== "human") {
    return { status: "none", files: [], modelProfileKind: "ai", modelProfileName: profile.name };
  }
  if (!humanProfileHasFaceReferences(profile)) {
    return { status: "missing-required", files: [], modelProfileKind: "human", modelProfileName: profile.name };
  }

  const files = await Promise.all(
    (profile.faceReferences ?? []).slice(0, 4).map((reference, index) =>
      referenceToFile(reference, index)
    )
  );

  const readable = files.filter((file): file is File => Boolean(file));
  return readable.length > 0
    ? { status: "ready", files: readable, modelProfileKind: "human", modelProfileName: profile.name }
    : { status: "missing-required", files: [], modelProfileKind: "human", modelProfileName: profile.name };
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
