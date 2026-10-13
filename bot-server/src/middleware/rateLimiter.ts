/**
 * In-memory sliding-window limiter. Fine for one instance; with several instances each keeps its own counts,
 * so a shared store (e.g. Redis) would be the production upgrade. Documented as a known limitation.
 */
export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly limit: number, private readonly windowMs: number, private readonly now: () => number = Date.now) {}

  /** Returns 0 if the call is allowed (and records it), otherwise the seconds until a slot frees up. */
  consume(key: string): number {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > t - this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return Math.max(1, Math.ceil((recent[0] + this.windowMs - t) / 1000));
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.sweep(); // bound memory
    return 0;
  }

  sweep(): void {
    const t = this.now();
    for (const [k, v] of this.hits) if (!v.some((ts) => ts > t - this.windowMs)) this.hits.delete(k);
  }
}

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) { super("rate limited"); }
}
export class TimeoutError extends Error {
  constructor() { super("request timed out"); }
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new TimeoutError()), ms); }),
  ]).finally(() => clearTimeout(timer));
}
