import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { cleanFolder, isRecord } from "@/lib/validation";

const OUTPUT_DIR = path.resolve(process.cwd(), "output");

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const subfolder =
      isRecord(body) && typeof body.subfolder === "string" && body.subfolder.trim()
        ? cleanFolder(body.subfolder)
        : "";
    const target = subfolder ? path.resolve(OUTPUT_DIR, subfolder) : OUTPUT_DIR;

    if (target !== OUTPUT_DIR && !target.startsWith(OUTPUT_DIR + path.sep)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const dir = existsSync(target) ? target : OUTPUT_DIR;
    execFile("explorer.exe", [dir]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Open folder error:", err);
    return NextResponse.json({ error: "Failed to open folder" }, { status: 500 });
  }
}
