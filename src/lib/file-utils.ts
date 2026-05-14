import { put, del, list } from "@vercel/blob";

export async function saveFile(folder: string, filename: string, data: Buffer): Promise<string> {
  const pathname = `${folder}/${filename}`;
  const blob = await put(pathname, data, { access: "public", addRandomSuffix: false });
  return blob.url;
}

export async function readRemoteFile(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function deleteFolder(folder: string): Promise<void> {
  const blobs = await list({ prefix: folder });
  if (blobs.blobs.length > 0) {
    await del(blobs.blobs.map((b) => b.url));
  }
}
