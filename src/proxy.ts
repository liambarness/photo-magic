import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAppPassword, verifyAuthToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const password = getAppPassword();
  if (!password) return NextResponse.next();

  if (request.nextUrl.pathname === "/login") return NextResponse.next();
  if (request.nextUrl.pathname === "/api/login") return NextResponse.next();

  const authed = request.cookies.get("auth")?.value;
  if (await verifyAuthToken(authed)) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
