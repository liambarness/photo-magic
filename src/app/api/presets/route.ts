import { NextResponse } from "next/server";
import { getPresets, addPreset, updatePreset, deletePreset } from "@/lib/server-store";

export async function GET() {
  const presets = await getPresets();
  return NextResponse.json(presets);
}

export async function POST(request: Request) {
  const preset = await request.json();
  const presets = await addPreset(preset);
  return NextResponse.json(presets);
}

export async function PATCH(request: Request) {
  const { id, ...patch } = await request.json();
  const presets = await updatePreset(id, patch);
  return NextResponse.json(presets);
}

export async function DELETE(request: Request) {
  const { id } = await request.json();
  const presets = await deletePreset(id);
  return NextResponse.json(presets);
}
