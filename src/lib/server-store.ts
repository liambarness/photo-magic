import type { Preset } from "@/types";
import { putBlob, readBlobJson as readJsonBlob } from "@/lib/blob-utils";

const LEGACY_STORE_KEY = "data/store.json";
const SETTINGS_KEY = "data/settings.json";
const PRESETS_KEY = "data/presets.json";

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

const CACHE_TTL_MS = 30_000;

let storeQueue = Promise.resolve();
let settingsCache: { value: SettingsData; expiresAt: number } | null = null;
let presetsCache: { value: Preset[]; expiresAt: number } | null = null;

function withStoreLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = storeQueue.then(operation, operation);
  storeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function readBlobJson<T>(key: string): Promise<T | null> {
  return readJsonBlob<T>(key);
}

async function writeBlobJson(key: string, data: unknown): Promise<void> {
  await putBlob(key, JSON.stringify(data, null, 2), {
    contentType: "application/json",
  });
}

function cacheSettings(settings: SettingsData): SettingsData {
  settingsCache = { value: settings, expiresAt: Date.now() + CACHE_TTL_MS };
  return settings;
}

function cachePresets(presets: Preset[]): Preset[] {
  presetsCache = { value: presets, expiresAt: Date.now() + CACHE_TTL_MS };
  return presets;
}

async function readLegacyStore(): Promise<Partial<StoreData> | null> {
  return readBlobJson<Partial<StoreData>>(LEGACY_STORE_KEY);
}

export async function readStore(): Promise<StoreData> {
  const now = Date.now();
  if (
    settingsCache &&
    presetsCache &&
    settingsCache.expiresAt > now &&
    presetsCache.expiresAt > now
  ) {
    return {
      settings: settingsCache.value,
      presets: presetsCache.value,
    };
  }

  const [settings, presets, legacy] = await Promise.all([
    readBlobJson<Partial<SettingsData>>(SETTINGS_KEY),
    readBlobJson<Preset[]>(PRESETS_KEY),
    readLegacyStore(),
  ]);

  const store = {
    settings: {
      ...DEFAULTS.settings,
      ...(legacy?.settings ?? {}),
      ...(settings ?? {}),
    },
    presets: presets ?? legacy?.presets ?? [],
  };

  cacheSettings(store.settings);
  cachePresets(store.presets);
  return store;
}

export async function writeStore(data: StoreData): Promise<void> {
  await Promise.all([
    writeBlobJson(SETTINGS_KEY, data.settings),
    writeBlobJson(PRESETS_KEY, data.presets),
  ]);
}

export async function getSettings(): Promise<SettingsData> {
  if (settingsCache && settingsCache.expiresAt > Date.now()) {
    return settingsCache.value;
  }

  const settings = await readBlobJson<Partial<SettingsData>>(SETTINGS_KEY);
  if (settings) return cacheSettings({ ...DEFAULTS.settings, ...settings });

  const legacy = await readLegacyStore();
  return cacheSettings({ ...DEFAULTS.settings, ...legacy?.settings });
}

export async function updateSettings(patch: Partial<SettingsData>): Promise<SettingsData> {
  return withStoreLock(async () => {
    const settings = { ...(await getSettings()), ...patch };
    await writeBlobJson(SETTINGS_KEY, settings);
    return cacheSettings(settings);
  });
}

export async function resetSettings(): Promise<SettingsData> {
  return withStoreLock(async () => {
    const settings = { ...DEFAULTS.settings };
    await writeBlobJson(SETTINGS_KEY, settings);
    return cacheSettings(settings);
  });
}

export async function getPresets(): Promise<Preset[]> {
  if (presetsCache && presetsCache.expiresAt > Date.now()) {
    return presetsCache.value;
  }

  const presets = await readBlobJson<Preset[]>(PRESETS_KEY);
  if (presets) return cachePresets(presets);

  const legacy = await readLegacyStore();
  return cachePresets(legacy?.presets ?? []);
}

export async function addPreset(preset: Preset): Promise<Preset[]> {
  return withStoreLock(async () => {
    const presets = await getPresets();
    const next = [...presets.filter((p) => p.id !== preset.id), preset];
    await writeBlobJson(PRESETS_KEY, next);
    return cachePresets(next);
  });
}

export async function updatePreset(id: string, patch: Partial<Omit<Preset, "id" | "createdAt">>): Promise<Preset[]> {
  return withStoreLock(async () => {
    const presets = await getPresets();
    const next = presets.map((p) =>
      p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p
    );
    await writeBlobJson(PRESETS_KEY, next);
    return cachePresets(next);
  });
}

export async function deletePreset(id: string): Promise<Preset[]> {
  return withStoreLock(async () => {
    const presets = await getPresets();
    const next = presets.filter((p) => p.id !== id);
    await writeBlobJson(PRESETS_KEY, next);
    return cachePresets(next);
  });
}

export { DEFAULTS as STORE_DEFAULTS };
export type { SettingsData, StoreData };
