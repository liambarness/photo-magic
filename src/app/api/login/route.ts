import { NextResponse } from "next/server";
import { AUTH_MAX_AGE_SECONDS, createAuthToken, getAppPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const isNativeForm = !contentType.includes("application/json");
  const password = isNativeForm
    ? String((await request.formData()).get("password") ?? "")
    : String(((await request.json()) as { password?: unknown }).password ?? "");
  const correct = getAppPassword();

  if (!correct || password !== correct) {
    if (isNativeForm) {
      return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
    }
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const res = isNativeForm
    ? NextResponse.redirect(new URL("/", request.url), 303)
    : NextResponse.json({ ok: true });
  res.cookies.set("auth", await createAuthToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: AUTH_MAX_AGE_SECONDS,
  });
  return res;
}
