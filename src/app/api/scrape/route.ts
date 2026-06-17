import { NextResponse } from "next/server";
import JSZip from "jszip";
import { cleanText } from "@/lib/validation";

interface ShopifyImage {
  src: string;
}

interface ShopifyProduct {
  title: string;
  images: ShopifyImage[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "item";
}

function filenameFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  return pathname.split("/").pop() || "image.jpg";
}

async function fetchAllProducts(baseUrl: string): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  let page = 1;

  while (true) {
    const url = `${baseUrl}?page=${page}&limit=30`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Shopify returned ${res.status}`);

    const json = await res.json();
    const products: ShopifyProduct[] = json.products ?? [];
    if (products.length === 0) break;

    all.push(...products);
    if (products.length < 30) break;
    page++;
  }

  return all;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let rawUrl = cleanText((body as Record<string, unknown>).url, 500);
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing URL" }, { status: 400 });
  }

  if (!/^https?:\/\//i.test(rawUrl)) rawUrl = `https://${rawUrl}`;

  let productsJsonUrl: string;
  try {
    const parsed = new URL(rawUrl);
    const path = parsed.pathname
      .replace(/\/products\.json\/?$/i, "")
      .replace(/\/+$/, "");

    productsJsonUrl = `${parsed.origin}${path}/products.json`;

    const probe = await fetch(productsJsonUrl, { method: "HEAD", signal: AbortSignal.timeout(8_000) });
    if (!probe.ok) {
      return NextResponse.json({ error: "Could not find products.json at that URL" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  let products: ShopifyProduct[];
  try {
    products = await fetchAllProducts(productsJsonUrl);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch products: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 502 }
    );
  }

  if (products.length === 0) {
    return NextResponse.json({ error: "No products found at that URL" }, { status: 404 });
  }

  const collectionSlug = new URL(productsJsonUrl).pathname
    .split("/")
    .filter(Boolean)
    .find((seg) => seg !== "collections" && seg !== "products.json") || "collection";

  const zip = new JSZip();

  interface DownloadJob {
    filepath: string;
    src: string;
  }

  const jobs: DownloadJob[] = [];

  for (const product of products) {
    const productFolder = slugify(product.title);
    for (const image of product.images) {
      const originalFilename = filenameFromUrl(image.src);
      const folder = `${slugify(collectionSlug)}/${productFolder}`;

      jobs.push({ filepath: `${folder}/${originalFilename}`, src: image.src });
    }
  }

  const BATCH_SIZE = 8;
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async ({ filepath, src }) => {
        try {
          const res = await fetch(src, { signal: AbortSignal.timeout(30_000) });
          if (!res.ok) return;
          const buffer = await res.arrayBuffer();
          zip.file(filepath, buffer);
        } catch {
          // skip failed images
        }
      })
    );
  }

  const filesInZip = Object.keys(zip.files).filter((f) => !zip.files[f].dir).length;
  const zipBuffer = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 5 } });

  return new Response(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slugify(collectionSlug)}.zip"`,
      "X-Products": String(products.length),
      "X-Images-Expected": String(jobs.length),
      "X-Images-Zipped": String(filesInZip),
    },
  });
}
