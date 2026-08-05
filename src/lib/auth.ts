import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  type SessionRole,
  decryptSession,
  encryptSession,
} from "./session";

export { hashPassword, validatePassword, verifyPassword } from "./password";

// ---- Session cookie ----

export async function createSession(user: {
  id: string;
  username: string;
  role: SessionRole;
}) {
  const token = await encryptSession({
    userId: user.id,
    username: user.username,
    role: user.role,
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Production sits behind Nginx + Let's Encrypt; dev is plain http://localhost,
    // where a Secure cookie would silently never be stored.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// ---- Data access layer ----
// proxy.ts only does an optimistic cookie check; these are the real guard and
// must be called by every page, server action and route handler that touches data.

export type CurrentUser = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: SessionRole;
};

/** Returns null when signed out — use `requireUser()` when the caller needs a user. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  const session = await decryptSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  // Re-read the user each render pass so a deactivated or deleted account loses
  // access immediately rather than when its 12h token happens to expire.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, username: true, name: true, email: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) return null;

  const { isActive: _isActive, ...safe } = user;
  return safe;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

/**
 * Route-handler guard. Returns a 401 Response when signed out, otherwise null:
 *
 *   const denied = await apiAuthGuard();
 *   if (denied) return denied;
 *
 * Route handlers answer fetch() calls and download links, so they get a status
 * code rather than the redirect `requireUser()` would issue.
 */
export async function apiAuthGuard(): Promise<Response | null> {
  const user = await getCurrentUser();
  if (user) return null;
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
