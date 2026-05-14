import { NextResponse } from "next/server";
import { readBlob } from "@/lib/blob-utils";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const blobUrl = url.searchParams.get("url");

  if (!blobUrl) {
    return NextResponse.json({ error: "Missing blob URL" }, { status: 400 });
  }

  try {
    const blob = await readBlob(blobUrl);
    return new NextResponse(new Uint8Array(blob.buffer), {
      headers: {
        "Content-Type": blob.contentType,
        "Cache-Control": blob.cacheControl,
      },
    });
  } catch (err) {
    console.error("Blob proxy error:", err);
    return NextResponse.json({ error: "Blob not found" }, { status: 404 });
  }
}
