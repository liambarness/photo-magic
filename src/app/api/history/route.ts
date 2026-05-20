import { NextResponse } from "next/server";
import {
  clearImageHistory,
  deleteImageHistoryItems,
  getImageHistory,
  historyItemToSourcePhoto,
  mergeSourcePhotos,
  updateImageHistoryVisibility,
} from "@/lib/image-history";
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

  if (
    isRecord(body) &&
    body.action === "visibility" &&
    Array.isArray(body.ids) &&
    (body.visibility === "active" || body.visibility === "archived")
  ) {
    await updateImageHistoryVisibility(body.ids.filter((id): id is string => typeof id === "string"), body.visibility);
    return NextResponse.json({ ok: true });
  }

  if (!isRecord(body) || !Array.isArray(body.photos)) {
    return NextResponse.json({ error: "Invalid history payload" }, { status: 400 });
  }

  await mergeSourcePhotos(body.photos as SourcePhoto[]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  if (isRecord(body) && Array.isArray(body.ids)) {
    const deleted = await deleteImageHistoryItems(body.ids.filter((id): id is string => typeof id === "string"));
    return NextResponse.json({ ok: true, deleted });
  }

  await clearImageHistory();
  return NextResponse.json({ ok: true });
}
