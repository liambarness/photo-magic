import type { Preset } from "@/types";
import type { SettingsData } from "@/lib/server-store";

export const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
export const ALLOWED_IMAGE_SIZES = new Set(["1024x1024", "1536x1024", "1024x1536"]);
export const ALLOWED_IMAGE_QUALITIES = new Set(["low", "medium", "high", "auto"]);
export const ALLOWED_OUTPUT_FORMATS = new Set(["png", "jpeg", "webp"]);

export const MAX_UPLOAD_FILES = 50;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function cleanPathSegment(value: unknown, fallback = "item"): string {
  const cleaned = cleanText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned || fallback;
}

export function cleanFolder(value: unknown): string {
  const parts = cleanText(value, 160)
    .split("/")
    .map((part) => cleanPathSegment(part, "batch"))
    .filter(Boolean);

  return parts.join("/") || new Date().toISOString().slice(0, 10);
}

export function cleanExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "png";
  return ALLOWED_EXTENSIONS.has(ext) ? ext : "png";
}

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "Only PNG, JPEG, and WebP images are supported";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Images must be ${MAX_UPLOAD_BYTES / 1024 / 1024}MB or smaller`;
  }
  return null;
}

export function readImageOptions(body: Record<string, unknown>) {
  const imageSize = typeof body.imageSize === "string" && ALLOWED_IMAGE_SIZES.has(body.imageSize)
    ? body.imageSize
    : "1024x1024";
  const imageQuality = typeof body.imageQuality === "string" && ALLOWED_IMAGE_QUALITIES.has(body.imageQuality)
    ? body.imageQuality
    : "auto";
  const outputFormat = typeof body.outputFormat === "string" && ALLOWED_OUTPUT_FORMATS.has(body.outputFormat)
    ? body.outputFormat
    : "png";

  return { imageSize, imageQuality, outputFormat };
}

export function sanitizeSettingsPatch(raw: unknown): Partial<SettingsData> {
  if (!isRecord(raw)) return {};

  const patch: Partial<SettingsData> = {};

  if (typeof raw.brandRules === "string") patch.brandRules = raw.brandRules.slice(0, 5000);
  if (typeof raw.background === "string") patch.background = raw.background.slice(0, 2000);
  if (typeof raw.concurrency === "number") {
    patch.concurrency = Math.min(8, Math.max(1, Math.floor(raw.concurrency)));
  }
  if (typeof raw.imageSize === "string" && ALLOWED_IMAGE_SIZES.has(raw.imageSize)) {
    patch.imageSize = raw.imageSize;
  }
  if (typeof raw.imageQuality === "string" && ALLOWED_IMAGE_QUALITIES.has(raw.imageQuality)) {
    patch.imageQuality = raw.imageQuality;
  }
  if (typeof raw.outputFormat === "string" && ALLOWED_OUTPUT_FORMATS.has(raw.outputFormat)) {
    patch.outputFormat = raw.outputFormat;
  }
  if (typeof raw.timeoutSeconds === "number") {
    patch.timeoutSeconds = Math.min(600, Math.max(30, Math.floor(raw.timeoutSeconds)));
  }

  return patch;
}

export function sanitizePreset(raw: unknown): Preset | null {
  if (!isRecord(raw)) return null;

  const name = cleanText(raw.name, 120);
  if (!name) return null;

  const now = Date.now();
  const shotMode = raw.shotMode === "model" ? "model" : "product";

  return {
    id: cleanText(raw.id, 80) || crypto.randomUUID(),
    name,
    shotMode,
    framing: shotMode === "model" ? cleanText(raw.framing, 300) : "",
    description: cleanText(raw.description, 5000),
    polishedPrompt: typeof raw.polishedPrompt === "string" ? raw.polishedPrompt.slice(0, 5000) : null,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : now,
  };
}

export function sanitizePresetPatch(raw: unknown): Partial<Omit<Preset, "id" | "createdAt">> {
  if (!isRecord(raw)) return {};

  const patch: Partial<Omit<Preset, "id" | "createdAt">> = {};

  if (typeof raw.name === "string") patch.name = cleanText(raw.name, 120);
  if (raw.shotMode === "product" || raw.shotMode === "model") patch.shotMode = raw.shotMode;
  if (typeof raw.framing === "string") patch.framing = cleanText(raw.framing, 300);
  if (typeof raw.description === "string") patch.description = cleanText(raw.description, 5000);
  if (typeof raw.polishedPrompt === "string") patch.polishedPrompt = raw.polishedPrompt.slice(0, 5000);
  if (raw.polishedPrompt === null) patch.polishedPrompt = null;

  return patch;
}
