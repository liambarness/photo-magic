import { del, list } from "@vercel/blob";
import { putBlob, readBlob } from "@/lib/blob-utils";

export async function saveFile(folder: string, filename: string, data: Buffer): Promise<string> {
  const pathname = `${folder}/${filename}`;
  const blob = await putBlob(pathname, data);
  return blob.url;
}

export async function readRemoteFile(url: string): Promise<Buffer> {
  const { buffer } = await readBlob(url);
  return buffer;
}

export async function deleteFolder(folder: string): Promise<void> {
  const blobs = await list({ prefix: folder });
  if (blobs.blobs.length > 0) {
    await del(blobs.blobs.map((b) => b.url));
  }
}
