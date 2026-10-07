import { NextResponse } from "next/server";
import { integrationAuth } from "@/lib/integration-auth";
import { getPresets, getModelProfiles } from "@/lib/server-store";
import { MODEL_WEARER_OPTIONS, MODEL_POSE_OPTIONS, humanProfileHasFaceReferences } from "@/lib/model-shot";
import { MAX_IMAGES, MAX_REQUEST_BYTES } from "@/lib/integration-contract";

export async function GET(request: Request) {
  const denied = integrationAuth(request); if (denied) return denied;
  try {
    const [presets, profiles] = await Promise.all([getPresets(), getModelProfiles()]);
    return NextResponse.json({
      version: 1, limits: { maxImages: MAX_IMAGES, maxRequestBytes: MAX_REQUEST_BYTES },
      presets: presets.filter((item) => item.polishedPrompt).map(({ id, name, shotMode, description }) => ({ id, name, shotMode, description })),
      modelProfiles: profiles.map((item) => ({
        id: item.id, name: item.name, wearerType: item.wearerType, kind: item.kind,
        hasFaceReferences: humanProfileHasFaceReferences(item),
      })),
      wearerTypes: MODEL_WEARER_OPTIONS.map(({ value, label }) => ({ value, label })),
      poses: MODEL_POSE_OPTIONS.map(({ value, label }) => ({ value, label })),
      touchUpStrengths: ["light", "standard", "deep"],
      touchUpBackgrounds: ["standard_gray", "preserve"],
      backgroundModes: ["global", "flat_white"],
      views: ["front", "back", "side", "detail", "unknown"],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "storage_unavailable" }, { status: 503 }); }
}
