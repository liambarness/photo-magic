import { NextResponse } from "next/server";
import {
  getModelProfiles,
  saveModelProfile,
  updateModelProfile,
  deleteModelProfile,
} from "@/lib/server-store";
import { cleanText, isRecord } from "@/lib/validation";
import type { ModelWearerType } from "@/types";

function cleanWearerType(value: unknown): ModelWearerType {
  return value === "womens" || value === "youth" || value === "toddler"
    ? value
    : "mens";
}

function sanitizeModelProfile(raw: unknown) {
  if (!isRecord(raw)) return null;

  const name = cleanText(raw.name, 120);
  if (!name) return null;

  const now = Date.now();
  return {
    id: cleanText(raw.id, 80) || crypto.randomUUID(),
    name,
    wearerType: cleanWearerType(raw.wearerType),
    prompt: cleanText(raw.prompt, 2000),
    styling: cleanText(raw.styling, 2000),
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : now,
  };
}

export async function GET() {
  const profiles = await getModelProfiles();
  return NextResponse.json(profiles);
}

export async function POST(request: Request) {
  const profile = sanitizeModelProfile(await request.json().catch(() => null));
  if (!profile) {
    return NextResponse.json({ error: "Invalid model profile" }, { status: 400 });
  }

  const profiles = await saveModelProfile(profile);
  return NextResponse.json(profiles);
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const id = cleanText(body.id, 80);
  if (!id) {
    return NextResponse.json({ error: "Missing profile id" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = cleanText(body.name, 120);
  if (typeof body.wearerType === "string") patch.wearerType = cleanWearerType(body.wearerType);
  if (typeof body.prompt === "string") patch.prompt = cleanText(body.prompt, 2000);
  if (typeof body.styling === "string") patch.styling = cleanText(body.styling, 2000);

  const profiles = await updateModelProfile(id, patch);
  return NextResponse.json(profiles);
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  const id = cleanText(isRecord(body) ? body.id : null, 80);
  if (!id) {
    return NextResponse.json({ error: "Missing profile id" }, { status: 400 });
  }

  const profiles = await deleteModelProfile(id);
  return NextResponse.json(profiles);
}
