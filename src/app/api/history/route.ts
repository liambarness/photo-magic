import { NextResponse } from "next/server";
import { getImageHistory, historyItemToSourcePhoto, mergeSourcePhotos, clearImageHistory } from "@/lib/image-history";
import type { SourcePhoto } from "@/types";

export async function GET() {
  const history = await getImageHistory();
  return NextResponse.json({
    photos: history.map(historyItemToSourcePhoto),
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { photos?: SourcePhoto[] };
  await mergeSourcePhotos(body.photos ?? []);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearImageHistory();
  return NextResponse.json({ ok: true });
}
