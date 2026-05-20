import { NextResponse } from "next/server";
import { head } from "@vercel/blob";
import { getOpenAIClient } from "@/lib/openai";
import { saveFile } from "@/lib/file-utils";
import { upsertSourceImage } from "@/lib/image-history";
import { blobServingUrl, readBlob } from "@/lib/blob-utils";
import {
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_TOTAL_BYTES,
  cleanExtension,
  cleanFolder,
  cleanPathSegment,
  formatBytes,
  isRecord,
  validateImageFile,
  validateUploadTotal,
} from "@/lib/validation";
import type { PhotoSettings } from "@/types";

const CLASSIFY_MAX_BYTES = 12 * 1024 * 1024;

interface RegisteredUploadItem {
  id: string;
  name: string;
  blobUrl: string;
  contentType: string;
  size: number;
  settings: PhotoSettings;
}

async function runPool<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function next(): Promise<void> {
    const current = index++;
    if (current >= tasks.length) return;
    results[current] = await tasks[current]();
    await next();
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => next()));
  return results;
}

async function classifyImage(
  buffer: Buffer,
  mime: string,
  product: string,
  shotType: string
): Promise<string> {
  try {
    const base64 = buffer.toString("base64");

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
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return handleRegisteredBlobUpload(request);
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_UPLOAD_TOTAL_BYTES + 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: `Upload request is too large. Review batches must be ${formatBytes(MAX_UPLOAD_TOTAL_BYTES)} or smaller.` },
        { status: 413 }
      );
    }

    const formData = await request.formData();
    const folder = cleanFolder(formData.get("folder"));
    const files = formData.getAll("files") as File[];
    const ids = formData.getAll("ids") as string[];
    const product = (formData.get("product") as string) || "";
    const shotType = (formData.get("shotType") as string) || "";
    const settings = parsePhotoSettings(formData.get("settings"), product, shotType);
    const itemSettings = parseItemSettings(formData.get("itemSettings"), settings);

    if (!folder || files.length === 0) {
      return NextResponse.json({ error: "Missing folder or files" }, { status: 400 });
    }
    if (files.length > MAX_UPLOAD_FILES) {
      return NextResponse.json({ error: `Upload up to ${MAX_UPLOAD_FILES} files at a time` }, { status: 400 });
    }
    const totalUploadError = validateUploadTotal(files);
    if (totalUploadError) {
      return NextResponse.json({ error: totalUploadError }, { status: 400 });
    }

    const uploadItems = files.map((file, index) => ({
      file,
      id: ids[index] || crypto.randomUUID(),
    }));

    for (const { file } of uploadItems) {
      const validationError = validateImageFile(file);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }
    }

    const results = await runPool(uploadItems.map(({ file, id }) => async () => {
      const ext = cleanExtension(file.name);
      const buffer = Buffer.from(await file.arrayBuffer());
      const mime = file.type || "image/png";

      const label = cleanPathSegment(await classifyImage(buffer, mime, product, shotType), "product");
      const subfolder = `${folder}/${label}`;
      const sourceFilename = `source_${id.slice(0, 8)}.${ext}`;

      const blobUrl = await saveFile(subfolder, sourceFilename, buffer);
      await upsertSourceImage({
        id,
        name: file.name,
        label,
        batchFolder: folder,
        sourceUrl: blobUrl,
        usedSettings: itemSettings[id] ?? settings,
      });

      return {
        id,
        label,
        serverPath: blobUrl,
        servingUrl: blobServingUrl(blobUrl),
      };
    }), 4);

    return NextResponse.json({ results });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

function cleanModelWearerType(value: unknown): PhotoSettings["modelWearerType"] {
  return value === "womens" || value === "youth" || value === "toddler" || value === "mens"
    ? value
    : undefined;
}

function cleanModelPoseType(value: unknown): PhotoSettings["modelPoseType"] {
  return value === "full_body" ||
    value === "upper_face_visible" ||
    value === "upper_no_face" ||
    value === "lower_no_face"
    ? value
    : undefined;
}

function cleanViewType(value: unknown): PhotoSettings["viewType"] {
  return value === "front" || value === "back" || value === "side" || value === "detail" || value === "unknown"
    ? value
    : undefined;
}

function cleanShotMode(value: unknown, fallback: PhotoSettings["shotMode"]): PhotoSettings["shotMode"] {
  return value === "model" || value === "product" || value === "touchup" ? value : fallback;
}

function cleanTouchUpStrength(value: unknown): PhotoSettings["touchUpStrength"] {
  return value === "light" || value === "standard" || value === "deep" ? value : undefined;
}

function cleanTouchUpBackground(value: unknown): PhotoSettings["touchUpBackground"] {
  return value === "standard_gray" || value === "preserve" ? value : undefined;
}

function normalizePhotoSettings(
  raw: Partial<PhotoSettings>,
  fallback: PhotoSettings
): PhotoSettings {
  return {
    presetId: typeof raw.presetId === "string" ? raw.presetId : fallback.presetId,
    presetName: typeof raw.presetName === "string" && raw.presetName ? raw.presetName.slice(0, 120) : fallback.presetName,
    shotMode: cleanShotMode(raw.shotMode, fallback.shotMode),
    modelGender: typeof raw.modelGender === "string" ? raw.modelGender.slice(0, 80) : fallback.modelGender,
    modelBuild: typeof raw.modelBuild === "string" ? raw.modelBuild.slice(0, 80) : fallback.modelBuild,
    modelWearerType: cleanModelWearerType(raw.modelWearerType) ?? fallback.modelWearerType,
    modelPoseType: cleanModelPoseType(raw.modelPoseType) ?? fallback.modelPoseType,
    modelProfileId: typeof raw.modelProfileId === "string" ? raw.modelProfileId.slice(0, 80) : fallback.modelProfileId,
    modelProfileName: typeof raw.modelProfileName === "string" ? raw.modelProfileName.slice(0, 120) : fallback.modelProfileName,
    productGroupId: typeof raw.productGroupId === "string" ? raw.productGroupId.slice(0, 80) : fallback.productGroupId,
    productGroupLabel: typeof raw.productGroupLabel === "string" ? raw.productGroupLabel.slice(0, 120) : fallback.productGroupLabel,
    viewType: cleanViewType(raw.viewType) ?? fallback.viewType,
    touchUpStrength: cleanTouchUpStrength(raw.touchUpStrength) ?? fallback.touchUpStrength,
    touchUpBackground: cleanTouchUpBackground(raw.touchUpBackground) ?? fallback.touchUpBackground,
    notes: typeof raw.notes === "string" ? raw.notes.slice(0, 1000) : fallback.notes,
    finalPrompt: typeof raw.finalPrompt === "string" ? raw.finalPrompt.slice(0, 8000) : fallback.finalPrompt ?? null,
  };
}

function parseItemSettings(
  raw: FormDataEntryValue | null,
  fallback: PhotoSettings
): Record<string, PhotoSettings> {
  if (typeof raw !== "string") return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return {};

    return parsed.reduce<Record<string, PhotoSettings>>((map, item) => {
      if (!item || typeof item !== "object") return map;
      const record = item as { id?: unknown; settings?: unknown };
      if (typeof record.id !== "string" || !record.settings || typeof record.settings !== "object") return map;
      map[record.id] = normalizePhotoSettings(record.settings as Partial<PhotoSettings>, fallback);
      return map;
    }, {});
  } catch {
    return {};
  }
}

async function handleRegisteredBlobUpload(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid upload metadata" }, { status: 400 });
  }

  const folder = cleanFolder(body.folder);
  const product = typeof body.product === "string" ? body.product : "";
  const shotType = typeof body.shotType === "string" ? body.shotType : "";
  const settings = parsePhotoSettings(
    typeof body.settings === "string" ? body.settings : JSON.stringify(body.settings ?? null),
    product,
    shotType
  );
  const uploadedItems = parseRegisteredUploadItems(body.items, settings);

  if (!folder || uploadedItems.length === 0) {
    return NextResponse.json({ error: "Missing folder or uploaded images" }, { status: 400 });
  }
  if (uploadedItems.length > MAX_UPLOAD_FILES) {
    return NextResponse.json({ error: `Upload up to ${MAX_UPLOAD_FILES} files at a time` }, { status: 400 });
  }

  const totalUploadError = validateUploadTotal(uploadedItems);
  if (totalUploadError) {
    return NextResponse.json({ error: totalUploadError }, { status: 400 });
  }

  for (const item of uploadedItems) {
    const metadata = await head(item.blobUrl).catch(() => null);
    if (!metadata) {
      return NextResponse.json({ error: `"${item.name}" was not found in Blob storage.` }, { status: 400 });
    }

    item.contentType = metadata.contentType || item.contentType;
    item.size = metadata.size;

    const expectedPrefix = `source-uploads/${cleanPathSegment(folder, "batch")}/${cleanPathSegment(item.id, "item")}/`;
    if (!metadata.pathname.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: `"${item.name}" does not match this upload batch.` },
        { status: 400 }
      );
    }

    const validationError = validateImageFile({
      name: item.name,
      type: item.contentType,
      size: item.size,
    });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
  }

  const actualTotalUploadError = validateUploadTotal(uploadedItems);
  if (actualTotalUploadError) {
    return NextResponse.json({ error: actualTotalUploadError }, { status: 400 });
  }

  const results = await runPool(uploadedItems.map((item) => async () => {
    const label = cleanPathSegment(
      await classifyUploadedBlob(item, product, shotType),
      "product"
    );
    await upsertSourceImage({
      id: item.id,
      name: item.name,
      label,
      batchFolder: folder,
      sourceUrl: item.blobUrl,
      usedSettings: item.settings,
    });

    return {
      id: item.id,
      label,
      serverPath: item.blobUrl,
      servingUrl: blobServingUrl(item.blobUrl),
    };
  }), 4);

  return NextResponse.json({ results });
}

function parseRegisteredUploadItems(raw: unknown, fallback: PhotoSettings): RegisteredUploadItem[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((item) => {
    if (!isRecord(item)) return [];

    const id = typeof item.id === "string" ? item.id.slice(0, 80) : "";
    const name = typeof item.name === "string" ? item.name.slice(0, 180) : "image";
    const blobUrl = typeof item.blobUrl === "string" ? item.blobUrl : "";
    const contentType = typeof item.contentType === "string" ? item.contentType : "";
    const size = typeof item.size === "number" ? item.size : 0;
    const settings = isRecord(item.settings)
      ? normalizePhotoSettings(item.settings as Partial<PhotoSettings>, fallback)
      : fallback;

    if (!id || !blobUrl.startsWith("http")) return [];

    return [{
      id,
      name,
      blobUrl,
      contentType,
      size,
      settings,
    }];
  });
}

async function classifyUploadedBlob(
  item: RegisteredUploadItem,
  product: string,
  shotType: string
): Promise<string> {
  if (item.size > CLASSIFY_MAX_BYTES) {
    return fallbackLabelFromFilename(item.name, product);
  }

  const blob = await readBlob(item.blobUrl).catch(() => null);
  if (!blob) return fallbackLabelFromFilename(item.name, product);

  return classifyImage(
    blob.buffer,
    blob.contentType || item.contentType || "image/png",
    product,
    shotType
  );
}

function fallbackLabelFromFilename(filename: string, product: string): string {
  const base = filename.replace(/\.[a-z0-9]+$/i, "");
  return cleanPathSegment(base, cleanPathSegment(product, "product"));
}

function parsePhotoSettings(
  raw: FormDataEntryValue | null,
  product: string,
  shotType: string
): PhotoSettings {
  try {
    if (typeof raw === "string") {
      const parsed = JSON.parse(raw) as Partial<PhotoSettings>;
      return normalizePhotoSettings({
        presetId: parsed.presetId ?? null,
        presetName: parsed.presetName || product || "None",
        shotMode: cleanShotMode(parsed.shotMode, shotType === "model" || shotType === "touchup" ? shotType : "product"),
        modelGender: typeof parsed.modelGender === "string" ? parsed.modelGender.slice(0, 80) : undefined,
        modelBuild: typeof parsed.modelBuild === "string" ? parsed.modelBuild.slice(0, 80) : undefined,
        modelWearerType: parsed.modelWearerType,
        modelPoseType: parsed.modelPoseType,
        modelProfileId: typeof parsed.modelProfileId === "string" ? parsed.modelProfileId.slice(0, 80) : undefined,
        modelProfileName: typeof parsed.modelProfileName === "string" ? parsed.modelProfileName.slice(0, 120) : undefined,
        productGroupId: typeof parsed.productGroupId === "string" ? parsed.productGroupId.slice(0, 80) : undefined,
        productGroupLabel: typeof parsed.productGroupLabel === "string" ? parsed.productGroupLabel.slice(0, 120) : undefined,
        viewType: parsed.viewType,
        touchUpStrength: parsed.touchUpStrength,
        touchUpBackground: parsed.touchUpBackground,
        notes: typeof parsed.notes === "string" ? parsed.notes.slice(0, 1000) : undefined,
        finalPrompt: typeof parsed.finalPrompt === "string" ? parsed.finalPrompt.slice(0, 8000) : null,
      }, {
        presetId: null,
        presetName: product || "None",
        shotMode: shotType === "model" || shotType === "touchup" ? shotType : "product",
      });
    }
  } catch {}

  return {
    presetId: null,
    presetName: product || "None",
    shotMode: shotType === "model" || shotType === "touchup" ? shotType : "product",
  };
}
