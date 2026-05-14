import type { PhotoSettings, SourcePhoto, TokenUsage } from "@/types";
import { blobServingUrl, blobStorageUrl, putBlob, readBlobJson } from "@/lib/blob-utils";

const HISTORY_KEY = "data/image-history.json";
const MAX_HISTORY_ITEMS = 500;

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
  cost: number;
  usage: TokenUsage | null;
  createdAt: number;
  updatedAt: number;
}

interface ImageHistoryData {
  items: ImageHistoryItem[];
}

async function readHistoryData(): Promise<ImageHistoryData> {
  const data = await readBlobJson<Partial<ImageHistoryData>>(HISTORY_KEY);
  return { items: Array.isArray(data?.items) ? data.items : [] };
}

export async function clearImageHistory(): Promise<void> {
  await writeHistoryData({ items: [] });
}

async function writeHistoryData(data: ImageHistoryData): Promise<void> {
  const items = data.items
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_HISTORY_ITEMS);

  await putBlob(HISTORY_KEY, JSON.stringify({ items }, null, 2), {
    contentType: "application/json",
  });
}

export async function getImageHistory(): Promise<ImageHistoryItem[]> {
  const data = await readHistoryData();
  return data.items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getImageHistoryItem(id: string): Promise<ImageHistoryItem | null> {
  const data = await readHistoryData();
  return data.items.find((item) => item.id === id) ?? null;
}

export async function updateImageHistoryItem(
  id: string,
  patch: Partial<Pick<
    ImageHistoryItem,
    "resultUrl" | "status" | "error" | "cost" | "usage" | "label" | "batchFolder" | "sourceUrl"
  >>
): Promise<void> {
  const data = await readHistoryData();
  const item = data.items.find((entry) => entry.id === id);
  if (!item) return;

  Object.assign(item, {
    ...patch,
    updatedAt: Date.now(),
  });

  await writeHistoryData(data);
}

export async function upsertSourceImage(input: {
  id: string;
  name: string;
  label: string;
  batchFolder: string;
  sourceUrl: string;
  usedSettings: PhotoSettings;
}): Promise<void> {
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
      cost: 0,
      usage: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  await writeHistoryData(data);
}

export async function mergeSourcePhotos(photos: SourcePhoto[]): Promise<void> {
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
        cost: photo.cost,
        usage: photo.usage,
        createdAt: photo.createdAt ?? now,
        updatedAt: now,
      });
    }
  }

  await writeHistoryData(data);
}

export function historyItemToSourcePhoto(item: ImageHistoryItem): SourcePhoto {
  return {
    id: item.id,
    name: item.name,
    label: item.label,
    batchFolder: item.batchFolder,
    previewUrl: blobServingUrl(item.sourceUrl),
    serverPath: item.sourceUrl,
    status: item.status === "processing" ? "pending" : item.status,
    resultUrl: item.resultUrl ? blobServingUrl(item.resultUrl) : null,
    error: item.error,
    usedSettings: item.usedSettings,
    cost: item.cost,
    usage: item.usage,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
