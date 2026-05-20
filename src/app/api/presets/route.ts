import { NextResponse } from "next/server";
import { getPresets, addPreset, updatePreset, deletePreset } from "@/lib/server-store";
import { cleanText, isRecord, sanitizePreset, sanitizePresetPatch } from "@/lib/validation";

export async function GET() {
  const presets = await getPresets();
  return NextResponse.json(presets);
}

export async function POST(request: Request) {
  const preset = sanitizePreset(await request.json().catch(() => null));
  if (!preset) {
    return NextResponse.json({ error: "Invalid preset" }, { status: 400 });
  }

  const presets = await addPreset(preset);
  return NextResponse.json(presets);
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const id = cleanText(isRecord(body) ? body.id : null, 80);
  const patch = sanitizePresetPatch(body);
  if (!id) {
    return NextResponse.json({ error: "Missing preset id" }, { status: 400 });
  }

  const presets = await updatePreset(id, patch);
  return NextResponse.json(presets);
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  const id = cleanText(isRecord(body) ? body.id : null, 80);
  if (!id) {
    return NextResponse.json({ error: "Missing preset id" }, { status: 400 });
  }

  const presets = await deletePreset(id);
  return NextResponse.json(presets);
}
