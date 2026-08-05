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
  humanProfileHasFaceReferences,
  poseUsesVisibleFace,
  type ModelFaceReference,
} from "@/lib/model-shot";
import type { ModelPoseType } from "@/types";

const MIME: Record<string, string> = {
  png: "image/png",
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

    if (faceReferences.status === "missing-required") {
      return NextResponse.json(
        { error: "This human model profile needs 1-4 face reference images before generating a face-visible model shot." },
        { status: 400 }
      );
    }

    inputImages.push(...faceReferences.files);
    const generationPrompt = faceReferences.files.length > 0
      ? `${prompt}\n\n${faceReferenceGuidance(faceReferences.files.length)}`
      : prompt;

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
  modelPoseType: ModelPoseType | undefined
): Promise<
  | { status: "none"; files: File[] }
  | { status: "ready"; files: File[] }
  | { status: "missing-required"; files: File[] }
> {
  if (!modelProfileId || !poseUsesVisibleFace(modelPoseType)) {
    return { status: "none", files: [] };
  }

  const profiles = await getModelProfiles();
  const profile = getModelProfile(modelProfileId, profiles);
  if (profile?.kind !== "human") {
    return { status: "none", files: [] };
  }
  if (!humanProfileHasFaceReferences(profile)) {
    return { status: "missing-required", files: [] };
  }

  const references = shuffle((profile.faceReferences ?? []).slice(0, 4));
  const files = await Promise.all(
    references.map((reference, index) =>
      referenceToFile(reference, index)
    )
  );

  const readable = files.filter((file): file is File => Boolean(file));
  return readable.length > 0
    ? { status: "ready", files: readable }
    : { status: "missing-required", files: [] };
}

function shuffle<T>(items: readonly T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function faceReferenceGuidance(referenceCount: number): string {
  const lastImageIndex = referenceCount + 1;
  const referenceRange = lastImageIndex === 2 ? "Image 2" : `Images 2-${lastImageIndex}`;

  return `${referenceRange} show the same person and collectively define the model's facial identity. Do not treat the earliest face reference as dominant. Preserve the same person's likeness while creating a fresh, natural expression and head position appropriate for this shot. Image 1 remains the authoritative source for the product. Do not copy clothing, background, lighting, pose, camera angle, or composition from the face references.`;
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
