import { NextResponse } from "next/server";

/**
 * In-memory sliding-window rate limiter.
 * Perfectly fine for a small launch community — every visitor shares one
 * server process. (Free upgrade path later: Upstash Redis free tier.)
 */
const buckets = new Map<string, number[]>();
let lastCleanup = Date.now();

export interface RateLimitResult {
  allowed: boolean;
  retryInMs: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();

  if (now - lastCleanup > 60_000) {
    lastCleanup = now;
    for (const [k, times] of buckets) {
      const kept = times.filter((t) => now - t < windowMs);
      if (kept.length > 0) buckets.set(k, kept);
      else buckets.delete(k);
    }
  }

  const times = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (times.length >= limit) {
    return { allowed: false, retryInMs: windowMs - (now - times[0]) };
  }
  times.push(now);
  buckets.set(key, times);
  return { allowed: true, retryInMs: 0 };
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function tooManyRequests(retryInMs: number, what: string) {
  return NextResponse.json(
    {
      error: `Whoa, slow down! Too many ${what}. Try again in ${Math.ceil(
        retryInMs / 1000,
      )}s. 🛡️`,
    },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(retryInMs / 1000)) },
    },
  );
}
