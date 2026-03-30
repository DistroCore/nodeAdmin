interface RateLimitWindow {
  count: number;
  startedAtMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export class HttpRateLimiter {
  private readonly windows = new Map<string, RateLimitWindow>();

  check(key: string, limit: number, windowMs: number, now: number = Date.now()): RateLimitDecision {
    const existing = this.windows.get(key);

    if (!existing || now - existing.startedAtMs >= windowMs) {
      this.windows.set(key, {
        count: 1,
        startedAtMs: now,
      });
      return {
        allowed: true,
        limit,
        remaining: Math.max(limit - 1, 0),
        retryAfterSeconds: Math.ceil(windowMs / 1000),
      };
    }

    if (existing.count >= limit) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - existing.startedAtMs)) / 1000)),
      };
    }

    existing.count += 1;

    return {
      allowed: true,
      limit,
      remaining: Math.max(limit - existing.count, 0),
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - existing.startedAtMs)) / 1000)),
    };
  }
}
