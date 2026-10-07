import { isRecord } from "@/lib/validation";

export const MAX_REQUEST_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGES = 4;
export const JOB_TIMEOUT_MS = 10 * 60 * 1000;
export const validJobId = (value: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);

export interface IntegrationImage {
  candidateId: string;
  sourceReference: string;
  filename: string;
  contentType: string;
  dataBase64: string;
  viewType: "front" | "back" | "side" | "detail" | "unknown";
}
export interface IntegrationRequest {
  version: 1;
  requestId: string;
  product: { reference: string; styleNumber: string; colorCode: string };
  options: {
    presetId: string;
    modelProfileId?: string;
    modelWearerType?: "mens" | "womens" | "youth" | "toddler";
    modelPoseType?: "full_body" | "upper_face_visible" | "upper_no_face" | "lower_no_face";
    touchUpStrength?: "light" | "standard" | "deep";
    touchUpBackground?: "standard_gray" | "preserve";
    backgroundMode?: "global" | "flat_white";
    notes?: string;
  };
  images: IntegrationImage[];
}

function text(value: unknown, limit = 300): value is string {
  return typeof value === "string" && value.length <= limit && !/[\u0000-\u001f]/.test(value);
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}
export function validateIntegrationRequest(value: unknown): IntegrationRequest {
  const fail = (): never => { throw new Error("invalid_request"); };
  if (!isRecord(value) || !keys(value, ["version", "requestId", "product", "options", "images"]) ||
      value.version !== 1 || typeof value.requestId !== "string" || !validJobId(value.requestId)) fail();
  const body = value as Record<string, unknown>;
  if (!isRecord(body.product) || !keys(body.product, ["reference", "styleNumber", "colorCode"]) ||
      !text(body.product.reference) || !body.product.reference ||
      !text(body.product.styleNumber) || !text(body.product.colorCode)) fail();
  if (!isRecord(body.options)) fail();
  const opts = body.options as Record<string, unknown>;
  if (!keys(opts, ["presetId", "modelProfileId", "modelWearerType", "modelPoseType", "touchUpStrength", "touchUpBackground", "backgroundMode", "notes"]) ||
      !text(opts.presetId) || !opts.presetId) fail();
  if (opts.modelProfileId !== undefined && !text(opts.modelProfileId)) fail();
  if (opts.notes !== undefined && !text(opts.notes, 1000)) fail();
  const enums: Record<string, string[]> = {
    modelWearerType: ["mens", "womens", "youth", "toddler"],
    modelPoseType: ["full_body", "upper_face_visible", "upper_no_face", "lower_no_face"],
    touchUpStrength: ["light", "standard", "deep"],
    touchUpBackground: ["standard_gray", "preserve"],
    backgroundMode: ["global", "flat_white"],
  };
  for (const [key, allowed] of Object.entries(enums))
    if (opts[key] !== undefined && !allowed.includes(String(opts[key]))) fail();
  if (!Array.isArray(body.images) || body.images.length < 1 || body.images.length > MAX_IMAGES) fail();
  const images = body.images as unknown[];
  const seen = new Set<string>();
  for (const item of images) {
    if (!isRecord(item) || !keys(item, ["candidateId", "sourceReference", "filename", "contentType", "dataBase64", "viewType"]) ||
        !text(item.candidateId) || !item.candidateId || !text(item.sourceReference, 2048) ||
        !text(item.filename) || !item.filename ||
        !["image/jpeg", "image/png", "image/webp"].includes(String(item.contentType)) ||
        !["front", "back", "side", "detail", "unknown"].includes(String(item.viewType)) ||
        typeof item.dataBase64 !== "string" || item.dataBase64.length === 0 ||
        item.dataBase64.length > MAX_REQUEST_BYTES || item.dataBase64.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(item.dataBase64)) fail();
    const image = item as unknown as IntegrationImage;
    if (seen.has(image.candidateId)) fail();
    seen.add(image.candidateId);
    const bytes = Buffer.from(image.dataBase64, "base64");
    if (bytes.toString("base64") !== image.dataBase64 || bytes.length < 12) fail();
    const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    if (!(image.contentType === "image/png" ? png : image.contentType === "image/jpeg" ? jpeg : webp)) fail();
  }
  return value as unknown as IntegrationRequest;
}
