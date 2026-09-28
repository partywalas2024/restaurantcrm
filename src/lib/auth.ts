// The authorization layer: session cookies plus the guards that every page,
// server action and route handler is expected to call.
//
// `src/proxy.ts` only inspects the session cookie and cannot verify that the
// account still exists, is still active, or still belongs to the restaurant
// it thinks it does. These functions re-read the user on each render pass, so
// deactivating someone (or moving them off a restaurant) takes effect
// immediately rather than whenever their token happens to expire. This module
// is `server-only`; the token primitives proxy.ts needs live in `session.ts`.
//
// Three roles, two guard families:
//   - requireUser()            any signed-in account — SUPER_ADMIN included.
//   - requireRestaurantUser()  signed-in AND belongs to a restaurant. This is
//                               THE guard for business data — a SUPER_ADMIN
//                               session has no restaurantId, so it physically
//                               cannot satisfy this guard. That is what makes
//                               "the platform can't read a restaurant's data"
//                               an enforced property instead of a convention.
//   - requireRestaurantAdmin() requireRestaurantUser() + RESTAURANT_ADMIN —
//                               that restaurant's own user management.
//   - requireSuperAdmin()      platform-level restaurant management only.

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
  restaurantId: string | null;
  restaurantName: string | null;
};

/** A signed-in user who is known (by the type system, not just at runtime) to belong to a restaurant. */
export type RestaurantUser = CurrentUser & { restaurantId: string; restaurantName: string };

/** Returns null when signed out — use `requireUser()` when the caller needs a user. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  const session = await decryptSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  // Re-read the user each render pass so a deactivated account, a deleted
  // account, or a restaurant reassignment takes effect immediately instead of
  // whenever its 12h token happens to expire.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true, username: true, name: true, email: true, role: true, isActive: true,
      restaurantId: true,
      restaurant: { select: { name: true, isActive: true } },
    },
  });
  if (!user || !user.isActive) return null;
  // A restaurant the platform has deactivated should lock its own team out too.
  if (user.restaurantId && !user.restaurant?.isActive) return null;

  // Built explicitly rather than spread, so `isActive` (and anything added to
  // the User model later) can't leak into what callers hand to the client.
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    restaurantId: user.restaurantId,
    restaurantName: user.restaurant?.name ?? null,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return user;
}

/**
 * The guard for every business-data page, server action and route handler.
 * A SUPER_ADMIN has no restaurantId by construction, so this redirects them
 * to their own platform area instead of ever reaching restaurant data.
 */
export async function requireRestaurantUser(): Promise<RestaurantUser> {
  const user = await requireUser();
  if (!user.restaurantId || !user.restaurantName) redirect("/platform");
  return { ...user, restaurantId: user.restaurantId, restaurantName: user.restaurantName };
}

/** That restaurant's own admin — for inviting/managing their own team and editing their profile. */
export async function requireRestaurantAdmin(): Promise<RestaurantUser> {
  const user = await requireRestaurantUser();
  if (user.role !== "RESTAURANT_ADMIN") redirect("/");
  return user;
}

/** Partywalas platform level — creates restaurants and grants access, never reads restaurant data. */
export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/");
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

/**
 * Route-handler equivalent of `requireRestaurantUser()`: 401 when signed out,
 * 403 when signed in but not attached to a restaurant (i.e. a SUPER_ADMIN
 * session hitting a business-data endpoint). Callers use the returned user's
 * `restaurantId` to scope every query.
 */
export async function apiRestaurantGuard(): Promise<{ user: RestaurantUser } | { denied: Response }> {
  const user = await getCurrentUser();
  if (!user) return { denied: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!user.restaurantId || !user.restaurantName) {
    return { denied: Response.json({ error: "This account is not attached to a restaurant." }, { status: 403 }) };
  }
  return { user: { ...user, restaurantId: user.restaurantId, restaurantName: user.restaurantName } };
}
