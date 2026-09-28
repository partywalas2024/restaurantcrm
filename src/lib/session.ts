// Session tokens — signed JWTs carried in an httpOnly cookie.
//
// This module is deliberately free of `server-only`, Prisma and Node-only
// imports: proxy.ts imports it for its optimistic redirect check, so it has to
// stay loadable outside the normal server component graph.

import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "pw_session";

/** 12 hours — a restaurant shift plus slack, short enough that a forgotten
 *  session on a shared back-office machine expires the same day. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export type SessionRole = "SUPER_ADMIN" | "RESTAURANT_ADMIN" | "USER";

export type SessionPayload = {
  userId: string;
  username: string;
  role: SessionRole;
};

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or too short (needs >= 32 chars). " +
        "Generate one with: openssl rand -base64 48",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function encryptSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function decryptSession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
    const { userId, username, role } = payload as Record<string, unknown>;
    if (typeof userId !== "string" || typeof username !== "string") return null;
    if (role !== "SUPER_ADMIN" && role !== "RESTAURANT_ADMIN" && role !== "USER") return null;
    return { userId, username, role };
  } catch {
    // Expired, tampered with, or signed under an old secret — all mean
    // "not signed in" as far as callers are concerned.
    return null;
  }
}
