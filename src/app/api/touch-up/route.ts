import { NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";
import { saveFile } from "@/lib/file-utils";
import { list } from "@vercel/blob";

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
    const { folder, photoId, label, sourceUrl, prompt, imageSize, imageQuality, outputFormat } = body;

    if (!folder || !photoId || !prompt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const subfolder = label ? `${folder}/${label}` : folder;
    const source = await resolveSourceImage(sourceUrl, subfolder, photoId);
    if (!source) {
      return NextResponse.json({ error: "Source image not found" }, { status: 404 });
    }

    const sourceRes = await fetch(source.url);
    const imageBuffer = Buffer.from(await sourceRes.arrayBuffer());
    const ext = source.ext;
    const imageFile = new File([imageBuffer], `source.${ext}`, {
      type: MIME[ext] || "image/png",
    });

    const format = outputFormat || "png";
    const quality = imageQuality || "auto";

    const openai = getOpenAIClient();
    const response = await openai.images.edit({
      model: "gpt-image-2",
      image: imageFile,
      prompt,
      n: 1,
      size: (imageSize as "1024x1024" | "1536x1024" | "1024x1536") || "1024x1024",
      quality: quality as "low" | "medium" | "high" | "auto",
      output_format: format as "png" | "jpeg" | "webp",
    });

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

    return NextResponse.json({
      resultUrl: `${resultUrl}?t=${Date.now()}`,
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
    const pathname = new URL(sourceUrl).pathname;
    return {
      url: sourceUrl,
      ext: pathname.split(".").pop()?.toLowerCase() || "png",
    };
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
