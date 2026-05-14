import { NextResponse } from "next/server";
import { getSettings, updateSettings, resetSettings } from "@/lib/server-store";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(settings);
}

export async function PATCH(request: Request) {
  const patch = await request.json();
  const settings = await updateSettings(patch);
  return NextResponse.json(settings);
}

export async function DELETE() {
  const settings = await resetSettings();
  return NextResponse.json(settings);
}
