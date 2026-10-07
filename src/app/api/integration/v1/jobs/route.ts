import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { integrationAuth } from "@/lib/integration-auth";
import { MAX_REQUEST_BYTES, validateIntegrationRequest } from "@/lib/integration-contract";
import { createJob, readJob, resolvePrompts, runJob, type Job } from "@/lib/integration-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const denied = integrationAuth(request); if (denied) return denied;
  if (!request.headers.get("content-type")?.includes("application/json"))
    return NextResponse.json({ error: "json_required" }, { status: 415 });
  let body;
  try {
    // Bound the actual stream, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new Error("empty");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) { await reader.cancel(); return NextResponse.json({ error: "request_too_large" }, { status: 413 }); }
      chunks.push(value);
    }
    body = validateIntegrationRequest(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch { return NextResponse.json({ error: "invalid_request" }, { status: 400 }); }
  const requestHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const accepted = (job: Job) => NextResponse.json({
    version: 1, jobId: job.jobId, statusUrl: `/api/integration/v1/jobs/${job.jobId}`, pollAfterSeconds: 3,
  }, { status: 202, headers: { "Cache-Control": "no-store" } });
  try {
    const existing = await readJob(body.requestId);
    if (existing) return existing.requestHash === requestHash ? accepted(existing) :
      NextResponse.json({ error: "request_id_conflict" }, { status: 409 });
    let resolved;
    try { resolved = await resolvePrompts(body); }
    catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (["preset_not_ready", "invalid_model_profile", "model_face_references_required"].includes(message))
        return NextResponse.json({ error: message }, { status: 422 });
      throw error;
    }
    const job: Job = { version: 1, jobId: body.requestId, requestHash, createdAt: Date.now(),
      product: body.product, images: body.images.map(({ candidateId, sourceReference, filename, viewType }) =>
        ({ candidateId, sourceReference, filename, viewType })) };
    try { await createJob(job); }
    catch (error) {
      const winner = await readJob(body.requestId);
      if (!winner) throw error;
      return winner.requestHash === requestHash ? accepted(winner) :
        NextResponse.json({ error: "request_id_conflict" }, { status: 409 });
    }
    after(() => runJob(body, resolved));
    return accepted(job);
  } catch { return NextResponse.json({ error: "storage_unavailable" }, { status: 503 }); }
}
