import { get, put } from "@vercel/blob";

export const BLOB_ACCESS = "private" as const;

export async function putBlob(
  pathname: string,
  data: Buffer | string,
  options: { contentType?: string } = {}
): Promise<{ url: string; pathname: string }> {
  const blob = await put(pathname, data, {
    access: BLOB_ACCESS,
    addRandomSuffix: false,
    contentType: options.contentType,
  });

  return { url: blob.url, pathname: blob.pathname };
}

export async function readBlob(urlOrPathname: string): Promise<{
  buffer: Buffer;
  contentType: string;
  cacheControl: string;
}> {
  const blob = await get(urlOrPathname, { access: BLOB_ACCESS });
  if (!blob) throw new Error("Blob not found");

  const arrayBuffer = await new Response(blob.stream).arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: blob.blob.contentType || "application/octet-stream",
    cacheControl: blob.blob.cacheControl || "private, max-age=60",
  };
}

export async function readBlobJson<T>(urlOrPathname: string): Promise<T | null> {
  try {
    const { buffer } = await readBlob(urlOrPathname);
    return JSON.parse(buffer.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function blobServingUrl(urlOrPathname: string): string {
  if (urlOrPathname.startsWith("/api/blob?")) return urlOrPathname;
  return `/api/blob?url=${encodeURIComponent(urlOrPathname)}`;
}

export function blobStorageUrl(urlOrServingUrl: string): string {
  if (!urlOrServingUrl.startsWith("/api/blob?")) return urlOrServingUrl;

  const url = new URL(urlOrServingUrl, "http://local");
  return url.searchParams.get("url") ?? urlOrServingUrl;
}
