// Route gate. In Next.js 16 this file is `proxy.ts` (formerly `middleware.ts`).
//
// This is an *optimistic* check — it only inspects the session cookie, and its
// job is to stop unauthenticated requests (including ones for statically
// prerendered pages like /upload, which never hit a server component) before
// they reach the app. The authoritative checks live in `requireUser()` /
// `requireAdmin()`, which every page, server action and route handler calls.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, decryptSession } from "@/lib/session";

const PUBLIC_PATHS = ["/signin"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  const session = await decryptSession(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  if (!session && !isPublic) {
    const url = new URL("/signin", request.url);
    // Send the visitor back where they were headed once they sign in.
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // Do NOT bounce cookie-bearing visitors off /signin based on the JWT alone.
  // After a DB import/reset the token can still decrypt while the user row is
  // gone; redirecting to / then back to /signin loops forever. The sign-in
  // page redirects only when getCurrentUser() finds a real account.

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals and static assets in /public.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml)$).*)",
  ],
};
