import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { integrationAuth } from "@/lib/integration-auth";
import { validJobId } from "@/lib/integration-contract";
import { readJob, imageState } from "@/lib/integration-jobs";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string; index: string }> }) {
  const denied = integrationAuth(request); if (denied) return denied;
  const { jobId, index } = await params;
  if (!validJobId(jobId) || !/^[0-3]$/.test(index)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const job = await readJob(jobId);
    if (!job || !job.images[Number(index)]) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const state = await imageState(job, Number(index));
    if (state.status !== "done" || !state.resultUrl)
      return NextResponse.json({ error: "result_not_ready" }, { status: 409 });
    const blob = await get(state.resultUrl, { access: "private", useCache: false });
    if (!blob) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return new Response(blob.stream, { headers: {
      "Content-Type": blob.blob.contentType || "application/octet-stream",
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch { return NextResponse.json({ error: "storage_unavailable" }, { status: 503 }); }
}
