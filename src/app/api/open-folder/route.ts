import { NextResponse } from "next/server";
import { exec } from "child_process";
import { existsSync } from "fs";
import path from "path";

const OUTPUT_DIR = path.join(process.cwd(), "output");

export async function POST(request: Request) {
  try {
    const { subfolder } = await request.json().catch(() => ({ subfolder: "" }));
    const target = subfolder ? path.join(OUTPUT_DIR, subfolder) : OUTPUT_DIR;

    if (target.includes("..")) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const dir = existsSync(target) ? target : OUTPUT_DIR;
    exec(`explorer.exe "${dir}"`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Open folder error:", err);
    return NextResponse.json({ error: "Failed to open folder" }, { status: 500 });
  }
}
