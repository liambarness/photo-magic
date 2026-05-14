import { head, put } from "@vercel/blob";
import type { PhotoSettings, SourcePhoto, TokenUsage } from "@/types";

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
  try {
    const info = await head(HISTORY_KEY);
    const res = await fetch(info.url);
    const data = (await res.json()) as Partial<ImageHistoryData>;
    return { items: Array.isArray(data.items) ? data.items : [] };
  } catch {
    return { items: [] };
  }
}

async function writeHistoryData(data: ImageHistoryData): Promise<void> {
  const items = data.items
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_HISTORY_ITEMS);

  await put(HISTORY_KEY, JSON.stringify({ items }, null, 2), {
    access: "public",
    addRandomSuffix: false,
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
    const sourceUrl = photo.serverPath ?? photo.previewUrl;
    if (!sourceUrl) continue;

    const resultUrl = photo.resultUrl?.split("?")[0] ?? null;
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
    previewUrl: item.sourceUrl,
    serverPath: item.sourceUrl,
    status: item.status === "processing" ? "pending" : item.status,
    resultUrl: item.resultUrl,
    error: item.error,
    usedSettings: item.usedSettings,
    cost: item.cost,
    usage: item.usage,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
