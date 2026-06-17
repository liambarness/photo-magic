import { NextResponse } from "next/server";
import { del, head } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  cleanPathSegment,
  formatBytes,
} from "@/lib/validation";

const TOKEN_TTL_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
  }

  try {
    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const safePathname = cleanUploadPathname(pathname);
        if (!safePathname || safePathname !== pathname) {
          throw new Error("Invalid upload path");
        }

        return {
          allowedContentTypes: Array.from(ALLOWED_IMAGE_TYPES),
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          validUntil: Date.now() + TOKEN_TTL_MS,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: clientPayload,
        };
      },
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload authorization failed";
    const status = message.includes("too large") ? 413 : 400;
    return NextResponse.json(
      {
        error:
          status === 413
            ? `Images must be under ${formatBytes(MAX_UPLOAD_BYTES)} each.`
            : message,
      },
      { status }
    );
  }
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  const blobUrls = Array.isArray((body as { blobUrls?: unknown } | null)?.blobUrls)
    ? (body as { blobUrls: unknown[] }).blobUrls
    : [];
  const urlsToDelete: string[] = [];

  for (const value of blobUrls.slice(0, MAX_UPLOAD_FILES)) {
    if (typeof value !== "string" || !value.startsWith("http")) continue;

    const metadata = await head(value).catch(() => null);
    if (!metadata) continue;
    if (cleanUploadPathname(metadata.pathname) !== metadata.pathname) continue;

    urlsToDelete.push(value);
  }

  if (urlsToDelete.length > 0) {
    await del(urlsToDelete);
  }

  return NextResponse.json({ deleted: urlsToDelete.length });
}

function cleanUploadPathname(pathname: string): string | null {
  if (pathname.startsWith("model-face-references/")) {
    return cleanModelFaceReferencePathname(pathname);
  }

  if (!pathname.startsWith("source-uploads/")) return null;
  if (pathname.includes("..") || pathname.includes("//")) return null;

  const parts = pathname.split("/");
  if (parts.length !== 4) return null;

  const [root, folder, id, ...filenameParts] = parts;
  const filename = filenameParts.join("-");
  if (root !== "source-uploads") return null;
  if (folder !== cleanPathSegment(folder, "batch")) return null;
  if (id !== cleanPathSegment(id, "item")) return null;
  if (!filename || filename.length > 180) return null;
  if (!/^[a-z0-9._-]+$/i.test(filename)) return null;

  return pathname;
}

function cleanModelFaceReferencePathname(pathname: string): string | null {
  if (pathname.includes("..") || pathname.includes("//")) return null;

  const parts = pathname.split("/");
  if (parts.length !== 4) return null;

  const [root, profileId, referenceId, ...filenameParts] = parts;
  const filename = filenameParts.join("-");
  if (root !== "model-face-references") return null;
  if (profileId !== cleanPathSegment(profileId, "profile")) return null;
  if (referenceId !== cleanPathSegment(referenceId, "reference")) return null;
  if (!filename || filename.length > 180) return null;
  if (!/^[a-z0-9._-]+$/i.test(filename)) return null;

  return pathname;
}
