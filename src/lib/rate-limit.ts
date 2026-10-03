/**
 * Best-effort anonymous write throttle.
 *
 * On a serverless runtime an in-memory map is per-instance and therefore only a
 * hint. It still removes accidental bursts from one client. The authoritative
 * limit is the database, which enforces bounded list sizes and the unique
 * idempotency constraint. Documented as best-effort rather than claimed as a
 * guarantee.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

export interface RateDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function consume(key: string, limit: number): RateDecision {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/** Drop expired buckets so the map cannot grow without bound. */
export function sweep(limit = 5_000): void {
  if (buckets.size <= limit) return;
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export const RATE_LIMITS = {
  /** Grading runs the engine over pasted text, so it gets a tighter budget. */
  grade: 30,
  create: 30,
  update: 80,
  delete: 30,
  export: 40,
  mcp: 120,
  read: 300,
} as const;