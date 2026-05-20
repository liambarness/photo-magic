import { NextResponse } from "next/server";
import { getImageHistory, historyItemToSourcePhoto, mergeSourcePhotos, clearImageHistory } from "@/lib/image-history";
import { isRecord } from "@/lib/validation";
import type { SourcePhoto } from "@/types";

export async function GET() {
  const history = await getImageHistory();
  return NextResponse.json({
    photos: history.map(historyItemToSourcePhoto),
  });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isRecord(body) || !Array.isArray(body.photos)) {
    return NextResponse.json({ error: "Invalid history payload" }, { status: 400 });
  }

  await mergeSourcePhotos(body.photos as SourcePhoto[]);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearImageHistory();
  return NextResponse.json({ ok: true });
}
