import { put, head } from "@vercel/blob";
import type { Preset } from "@/types";

const STORE_KEY = "data/store.json";

interface SettingsData {
  brandRules: string;
  background: string;
  concurrency: number;
  imageSize: string;
  imageQuality: string;
  outputFormat: string;
  timeoutSeconds: number;
}

interface StoreData {
  settings: SettingsData;
  presets: Preset[];
}

const DEFAULTS: StoreData = {
  settings: {
    brandRules: "Preserve the uploaded product design exactly. Do not change artwork, logo placement, colors, or graphic scale. Do not invent graphics or add extra logos or text. Keep shape and fit realistic. Maintain a premium surf brand aesthetic.",
    background: "Light grey seamless studio background (#EBEBEB), soft even diffused lighting, minimal shadow, clean and minimal catalog-style aesthetic",
    concurrency: 4,
    imageSize: "1024x1024",
    imageQuality: "auto",
    outputFormat: "png",
    timeoutSeconds: 300,
  },
  presets: [],
};

export async function readStore(): Promise<StoreData> {
  try {
    const info = await head(STORE_KEY);
    const res = await fetch(info.url);
    const data = (await res.json()) as Partial<StoreData>;
    return {
      settings: { ...DEFAULTS.settings, ...data.settings },
      presets: data.presets ?? [],
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function writeStore(data: StoreData): Promise<void> {
  await put(STORE_KEY, JSON.stringify(data, null, 2), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

export async function getSettings(): Promise<SettingsData> {
  const store = await readStore();
  return store.settings;
}

export async function updateSettings(patch: Partial<SettingsData>): Promise<SettingsData> {
  const store = await readStore();
  store.settings = { ...store.settings, ...patch };
  await writeStore(store);
  return store.settings;
}

export async function resetSettings(): Promise<SettingsData> {
  const store = await readStore();
  store.settings = { ...DEFAULTS.settings };
  await writeStore(store);
  return store.settings;
}

export async function getPresets(): Promise<Preset[]> {
  const store = await readStore();
  return store.presets;
}

export async function addPreset(preset: Preset): Promise<Preset[]> {
  const store = await readStore();
  store.presets.push(preset);
  await writeStore(store);
  return store.presets;
}

export async function updatePreset(id: string, patch: Partial<Omit<Preset, "id" | "createdAt">>): Promise<Preset[]> {
  const store = await readStore();
  store.presets = store.presets.map((p) =>
    p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p
  );
  await writeStore(store);
  return store.presets;
}

export async function deletePreset(id: string): Promise<Preset[]> {
  const store = await readStore();
  store.presets = store.presets.filter((p) => p.id !== id);
  await writeStore(store);
  return store.presets;
}

export { DEFAULTS as STORE_DEFAULTS };
export type { SettingsData, StoreData };
