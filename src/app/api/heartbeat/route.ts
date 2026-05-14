import { NextResponse } from "next/server";

let lastPing = Date.now();

export async function POST() {
  lastPing = Date.now();
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const elapsed = Date.now() - lastPing;
  return NextResponse.json({ lastPing, elapsed, alive: elapsed < 15000 });
}
