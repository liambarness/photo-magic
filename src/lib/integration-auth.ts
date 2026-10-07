import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export function integrationAuth(request: Request): NextResponse | null {
  const secret = process.env.PHOTO_MAGIC_API_SECRET;
  if (!secret) return NextResponse.json({ error: "integration_not_configured" }, { status: 503 });
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!supplied || !timingSafeEqual(digest(supplied), digest(secret)))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}
