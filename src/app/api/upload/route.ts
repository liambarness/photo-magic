import { NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";
import { saveFile } from "@/lib/file-utils";
import { upsertSourceImage } from "@/lib/image-history";
import { blobServingUrl } from "@/lib/blob-utils";
import type { PhotoSettings } from "@/types";

async function classifyImage(
  file: File,
  product: string,
  shotType: string
): Promise<string> {
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mime = file.type || "image/png";

    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 60,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Name this product image for file storage. ${product ? `Product: ${product}.` : ""} ${shotType ? `Shot type: ${shotType}.` : ""}
Reply with ONLY a short filename-safe label (lowercase, hyphens, no extension). Include: product type, main color, and angle/view if obvious. Examples: "black-boardshorts-front", "red-trucker-hat-side", "blue-rashguard-back". Keep it under 6 words.`,
            },
            {
              type: "image_url",
              image_url: { url: `data:${mime};base64,${base64}`, detail: "low" },
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    return (
      raw
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "product"
    );
  } catch (err) {
    console.error("Classify failed, using fallback:", err);
    return "product";
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const folder = formData.get("folder") as string;
    const files = formData.getAll("files") as File[];
    const ids = formData.getAll("ids") as string[];
    const product = (formData.get("product") as string) || "";
    const shotType = (formData.get("shotType") as string) || "";
    const settings = parsePhotoSettings(formData.get("settings"), product, shotType);

    if (!folder || files.length === 0) {
      return NextResponse.json({ error: "Missing folder or files" }, { status: 400 });
    }

    const results = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = ids[i] || crypto.randomUUID();
      const ext = file.name.split(".").pop() || "png";

      const label = await classifyImage(file, product, shotType);
      const subfolder = `${folder}/${label}`;
      const sourceFilename = `source_${id.slice(0, 8)}.${ext}`;

      const buffer = Buffer.from(await file.arrayBuffer());
      const blobUrl = await saveFile(subfolder, sourceFilename, buffer);
      await upsertSourceImage({
        id,
        name: file.name,
        label,
        batchFolder: folder,
        sourceUrl: blobUrl,
        usedSettings: settings,
      });

      results.push({
        id,
        label,
        serverPath: blobUrl,
        servingUrl: blobServingUrl(blobUrl),
      });
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

function parsePhotoSettings(
  raw: FormDataEntryValue | null,
  product: string,
  shotType: string
): PhotoSettings {
  try {
    if (typeof raw === "string") {
      const parsed = JSON.parse(raw) as Partial<PhotoSettings>;
      return {
        presetId: parsed.presetId ?? null,
        presetName: parsed.presetName || product || "None",
        shotMode: parsed.shotMode === "model" ? "model" : "product",
      };
    }
  } catch {}

  return {
    presetId: null,
    presetName: product || "None",
    shotMode: shotType === "model" ? "model" : "product",
  };
}
