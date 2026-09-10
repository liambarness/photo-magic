import type { PhotoSettings, SourcePhoto, TokenUsage } from "@/types";
import { blobServingUrl, blobStorageUrl, deleteBlobs, putBlob, readBlobJson } from "@/lib/blob-utils";
import { list } from "@vercel/blob";

const HISTORY_KEY = "data/image-history.json";
const MAX_HISTORY_ITEMS = 500;
const HISTORY_CACHE_TTL_MS = 15_000;
const STALE_PENDING_MS = 1000 * 60 * 30;

export interface ImageHistoryItem {
  id: string;
  name: string;
  label: string;
  batchFolder: string;
  sourceUrl: string;
  resultUrl: string | null;
  status: SourcePhoto["status"];
  error: string | null;
  usedSettings: PhotoSettings;
  visibility: SourcePhoto["visibility"];
  cost: number;
  usage: TokenUsage | null;
  createdAt: number;
  updatedAt: number;
}

interface ImageHistoryData {
  items: ImageHistoryItem[];
}

let historyQueue = Promise.resolve();
let historyCache: { value: ImageHistoryItem[]; expiresAt: number } | null = null;

function withHistoryLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = historyQueue.then(operation, operation);
  historyQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function readHistoryData(): Promise<ImageHistoryData> {
  if (historyCache && historyCache.expiresAt > Date.now()) {
    return { items: [...historyCache.value] };
  }

  const data = await readBlobJson<Partial<ImageHistoryData>>(HISTORY_KEY);
  const items = Array.isArray(data?.items) ? data.items : [];
  historyCache = { value: items, expiresAt: Date.now() + HISTORY_CACHE_TTL_MS };
  return { items };
}

export async function clearImageHistory(): Promise<void> {
  await withHistoryLock(() => writeHistoryData({ items: [] }));
}

async function writeHistoryData(data: ImageHistoryData): Promise<void> {
  const items = data.items
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_HISTORY_ITEMS);

  await putBlob(HISTORY_KEY, JSON.stringify({ items }, null, 2), {
    contentType: "application/json",
  });
  historyCache = { value: items, expiresAt: Date.now() + HISTORY_CACHE_TTL_MS };
}

export async function getImageHistory(): Promise<ImageHistoryItem[]> {
  return withHistoryLock(async () => {
    const data = await readHistoryData();
    const repaired = await repairSavedResults(data);
    if (repaired) await writeHistoryData(data);
    return data.items.sort((a, b) => b.updatedAt - a.updatedAt);
  });
}

export async function getImageHistoryItem(id: string): Promise<ImageHistoryItem | null> {
  const data = await readHistoryData();
  return data.items.find((item) => item.id === id) ?? null;
}

export async function updateImageHistoryItem(
  id: string,
  patch: Partial<Pick<
    ImageHistoryItem,
    "resultUrl" | "status" | "error" | "cost" | "usage" | "label" | "batchFolder" | "sourceUrl" | "visibility"
  >>
): Promise<void> {
  await withHistoryLock(async () => {
    const data = await readHistoryData();
    const item = data.items.find((entry) => entry.id === id);
    if (!item) return;

    Object.assign(item, {
      ...patch,
      updatedAt: Date.now(),
    });

    await writeHistoryData(data);
  });
}

export async function completeImageHistoryItem(input: {
  id: string;
  resultUrl: string;
  cost: number;
  usage: TokenUsage | null;
  label?: string;
  batchFolder?: string;
}): Promise<void> {
  await withHistoryLock(async () => {
    const data = await readHistoryData();
    const item = data.items.find((entry) => entry.id === input.id);
    if (!item) return;

    Object.assign(item, {
      resultUrl: input.resultUrl,
      status: "done" as const,
      error: null,
      cost: item.cost + input.cost,
      usage: input.usage,
      label: input.label ?? item.label,
      batchFolder: input.batchFolder ?? item.batchFolder,
      updatedAt: Date.now(),
    });

    await writeHistoryData(data);
  });
}

export async function updateImageHistoryVisibility(
  ids: string[],
  visibility: SourcePhoto["visibility"]
): Promise<void> {
  const idSet = new Set(ids);
  if (idSet.size === 0) return;

  await withHistoryLock(async () => {
    const data = await readHistoryData();
    const now = Date.now();
    let changed = false;

    for (const item of data.items) {
      if (!idSet.has(item.id)) continue;
      item.visibility = visibility;
      item.updatedAt = now;
      changed = true;
    }

    if (changed) await writeHistoryData(data);
  });
}

export async function deleteImageHistoryItems(ids: string[]): Promise<number> {
  const idSet = new Set(ids);
  if (idSet.size === 0) return 0;

  return withHistoryLock(async () => {
    const data = await readHistoryData();
    const toDelete = data.items.filter((item) => idSet.has(item.id));
    if (toDelete.length === 0) return 0;

    const urls = await collectDeleteUrls(toDelete);
    try {
      await deleteBlobs(urls);
    } catch (err) {
      console.error("Blob delete failed:", err);
    }

    data.items = data.items.filter((item) => !idSet.has(item.id));
    await writeHistoryData(data);
    return toDelete.length;
  });
}

async function collectDeleteUrls(items: ImageHistoryItem[]): Promise<Array<string | null>> {
  const urls = items.flatMap((item) => [item.sourceUrl, item.resultUrl]);

  for (const item of items) {
    const idPrefix = `_${item.id.slice(0, 8)}.`;
    const prefix = item.label ? `${item.batchFolder}/${item.label}/` : `${item.batchFolder}/`;
    try {
      const blobs = await list({ prefix });
      urls.push(
        ...blobs.blobs
          .filter((blob) => blob.pathname.includes(idPrefix))
          .map((blob) => blob.url)
      );
    } catch (err) {
      console.error("Blob delete listing failed:", err);
    }
  }

  return urls;
}

async function repairSavedResults(data: ImageHistoryData): Promise<boolean> {
  let repaired = false;
  const now = Date.now();

  for (const item of data.items) {
    if (item.resultUrl) continue;
    if (item.status !== "pending" && item.status !== "processing") continue;
    if (now - item.updatedAt <= STALE_PENDING_MS) continue;

    const resultUrl = await findSavedResultUrl(item);
    if (!resultUrl) continue;

    Object.assign(item, {
      resultUrl,
      status: "done" as const,
      error: null,
    });
    repaired = true;
  }

  return repaired;
}

async function findSavedResultUrl(item: ImageHistoryItem): Promise<string | null> {
  const prefix = item.label
    ? `${item.batchFolder}/${item.label}/result_${item.id.slice(0, 8)}.`
    : `${item.batchFolder}/result_${item.id.slice(0, 8)}.`;

  try {
    const blobs = await list({ prefix });
    return blobs.blobs[0]?.url ?? null;
  } catch (err) {
    console.error("Blob repair listing failed:", err);
    return null;
  }
}

export async function upsertSourceImage(input: {
  id: string;
  name: string;
  label: string;
  batchFolder: string;
  sourceUrl: string;
  usedSettings: PhotoSettings;
}): Promise<void> {
  await withHistoryLock(async () => {
    const data = await readHistoryData();
    const now = Date.now();
    const existing = data.items.find((item) => item.id === input.id);

    if (existing) {
      Object.assign(existing, {
        name: input.name,
        label: input.label,
        batchFolder: input.batchFolder,
        sourceUrl: input.sourceUrl,
        usedSettings: input.usedSettings,
        updatedAt: now,
      });
    } else {
      data.items.unshift({
        id: input.id,
        name: input.name,
        label: input.label,
        batchFolder: input.batchFolder,
        sourceUrl: input.sourceUrl,
        resultUrl: null,
        status: "pending",
        error: null,
        usedSettings: input.usedSettings,
        visibility: "active",
        cost: 0,
        usage: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    await writeHistoryData(data);
  });
}

export async function mergeSourcePhotos(photos: SourcePhoto[]): Promise<void> {
  await withHistoryLock(async () => {
    const data = await readHistoryData();
    const now = Date.now();

    for (const photo of photos) {
      const rawSource = photo.serverPath ?? photo.previewUrl;
      if (!rawSource || rawSource.startsWith("blob:")) continue;
      const sourceUrl = blobStorageUrl(rawSource);

      const resultUrl = photo.resultUrl ? blobStorageUrl(photo.resultUrl) : null;
      const existing = data.items.find((entry) => entry.id === photo.id);

      if (existing) {
        Object.assign(existing, {
          name: photo.name,
          label: photo.label,
          batchFolder: photo.batchFolder,
          sourceUrl,
          resultUrl,
          status: photo.status,
          error: photo.error,
          usedSettings: photo.usedSettings,
          visibility: photo.visibility ?? existing.visibility ?? "active",
          cost: photo.cost,
          usage: photo.usage,
          updatedAt: now,
        });
      } else {
        data.items.unshift({
          id: photo.id,
          name: photo.name,
          label: photo.label,
          batchFolder: photo.batchFolder,
          sourceUrl,
          resultUrl,
          status: photo.status,
          error: photo.error,
          usedSettings: photo.usedSettings,
          visibility: photo.visibility ?? "active",
          cost: photo.cost,
          usage: photo.usage,
          createdAt: photo.createdAt ?? now,
          updatedAt: now,
        });
      }
    }

    await writeHistoryData(data);
  });
}

function normalizePhotoSettings(settings: Partial<PhotoSettings> | null | undefined): PhotoSettings {
  return {
    presetId: typeof settings?.presetId === "string" ? settings.presetId : null,
    presetName: settings?.presetName || "None",
    shotMode:
      settings?.shotMode === "model" || settings?.shotMode === "touchup"
        ? settings.shotMode
        : "product",
    modelGender: typeof settings?.modelGender === "string" ? settings.modelGender : undefined,
    modelBuild: typeof settings?.modelBuild === "string" ? settings.modelBuild : undefined,
    modelWearerType:
      settings?.modelWearerType === "womens" ||
      settings?.modelWearerType === "youth" ||
      settings?.modelWearerType === "toddler" ||
      settings?.modelWearerType === "mens"
        ? settings.modelWearerType
        : settings?.modelGender === "female"
          ? "womens"
          : "mens",
    modelPoseType:
      settings?.modelPoseType === "full_body" ||
      settings?.modelPoseType === "upper_face_visible" ||
      settings?.modelPoseType === "upper_no_face" ||
      settings?.modelPoseType === "lower_no_face"
        ? settings.modelPoseType
        : "upper_face_visible",
    modelProfileId: typeof settings?.modelProfileId === "string" ? settings.modelProfileId : undefined,
    modelProfileName: typeof settings?.modelProfileName === "string" ? settings.modelProfileName : undefined,
    productGroupId: typeof settings?.productGroupId === "string" ? settings.productGroupId : undefined,
    productGroupLabel: typeof settings?.productGroupLabel === "string" ? settings.productGroupLabel : undefined,
    viewType:
      settings?.viewType === "front" ||
      settings?.viewType === "back" ||
      settings?.viewType === "side" ||
      settings?.viewType === "detail" ||
      settings?.viewType === "unknown"
        ? settings.viewType
        : undefined,
    touchUpStrength:
      settings?.touchUpStrength === "light" ||
      settings?.touchUpStrength === "standard" ||
      settings?.touchUpStrength === "deep"
        ? settings.touchUpStrength
        : settings?.shotMode === "touchup"
          ? "standard"
          : undefined,
    touchUpBackground:
      settings?.touchUpBackground === "standard_gray" ||
      settings?.touchUpBackground === "preserve"
        ? settings.touchUpBackground
        : settings?.shotMode === "touchup"
          ? "standard_gray"
          : undefined,
    backgroundMode:
      settings?.backgroundMode === "flat_white" || settings?.backgroundMode === "global"
        ? settings.backgroundMode
        : "global",
    notes: typeof settings?.notes === "string" ? settings.notes : undefined,
    finalPrompt: typeof settings?.finalPrompt === "string" ? settings.finalPrompt : null,
  };
}

export function historyItemToSourcePhoto(item: ImageHistoryItem): SourcePhoto {
  const isStalePending =
    !item.resultUrl &&
    (item.status === "pending" || item.status === "processing") &&
    Date.now() - item.updatedAt > STALE_PENDING_MS;

  return {
    id: item.id,
    name: item.name,
    label: item.label,
    batchFolder: item.batchFolder,
    previewUrl: blobServingUrl(item.sourceUrl),
    serverPath: item.sourceUrl,
    status: isStalePending
      ? "error"
      : item.status === "processing"
        ? "pending"
        : item.status,
    resultUrl: item.resultUrl ? blobServingUrl(item.resultUrl) : null,
    error: isStalePending
      ? "Incomplete run. The source uploaded, but no final render was saved."
      : item.error,
    usedSettings: normalizePhotoSettings(item.usedSettings),
    visibility: item.visibility ?? "active",
    cost: item.cost,
    usage: item.usage,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
