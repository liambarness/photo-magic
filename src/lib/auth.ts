const AUTH_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 90;

const encoder = new TextEncoder();

function getAuthSecret(): string | null {
  return process.env.AUTH_SECRET || process.env.APP_PASSWORD || null;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toHex(signature);
}

export function getAppPassword(): string | null {
  return process.env.APP_PASSWORD || null;
}

export async function createAuthToken(): Promise<string> {
  const secret = getAuthSecret();
  if (!secret) throw new Error("Missing auth secret");

  const issuedAt = Date.now().toString(36);
  const signature = await sign(issuedAt, secret);
  return `${issuedAt}.${signature}`;
}

export async function verifyAuthToken(token: string | undefined): Promise<boolean> {
  const secret = getAuthSecret();
  if (!secret || !token) return false;

  const [issuedAt, signature] = token.split(".");
  if (!issuedAt || !signature) return false;

  const issuedAtMs = Number.parseInt(issuedAt, 36);
  if (!Number.isFinite(issuedAtMs)) return false;
  if (Date.now() - issuedAtMs > AUTH_MAX_AGE_MS) return false;

  const expected = await sign(issuedAt, secret);
  return safeEqual(signature, expected);
}

export const AUTH_MAX_AGE_SECONDS = AUTH_MAX_AGE_MS / 1000;
