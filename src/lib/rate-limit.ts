// A small fixed-window rate limiter.
//
// Exists to protect the one endpoint that spends real money per call
// (/api/extract, which hits OpenAI). A compromised session, a stuck retry loop
// in a future feature, or a mis-click on a folder of files could otherwise run
// up a bill unnoticed.
//
// In-memory on purpose: one PM2 process serves this app, and the window only
// needs to outlive a burst, not a restart — the same trade-off the sign-in
// throttle already makes. If this ever runs as more than one instance, this
// (and that) must move to shared storage, because per-process counters stop
// meaning anything.

type Window = { count: number; resetAt: number };

const windows = new Map<string, Map<string, Window>>();

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Counts one hit against `key` in the named bucket.
 *
 * @param bucket  logical limiter name, e.g. "extract"
 * @param key     who is being limited, normally a user id
 */
export function rateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  let bucketWindows = windows.get(bucket);
  if (!bucketWindows) {
    bucketWindows = new Map();
    windows.set(bucket, bucketWindows);
  }

  const existing = bucketWindows.get(key);
  if (!existing || now >= existing.resetAt) {
    bucketWindows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count };
}
