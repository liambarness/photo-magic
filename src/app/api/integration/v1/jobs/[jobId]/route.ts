import { NextResponse } from "next/server";
import { integrationAuth } from "@/lib/integration-auth";
import { validJobId } from "@/lib/integration-contract";
import { readJob, jobResponse } from "@/lib/integration-jobs";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const denied = integrationAuth(request); if (denied) return denied;
  const { jobId } = await params;
  if (!validJobId(jobId)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const job = await readJob(jobId);
    if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(await jobResponse(job), { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "storage_unavailable" }, { status: 503 }); }
}
