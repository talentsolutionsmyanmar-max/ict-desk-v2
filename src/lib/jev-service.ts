import { evaluateJev, JevError, jevSourceId } from "./jev-core";
import type { JevReview, JevSource } from "./jev-contract";

// A secondary guardrail, NOT a distributed billing cap. Access control is mandatory.
export class JevService {
  private cache = new Map<string, { until: number; review: JevReview }>();
  private busy = false;
  private attempts: number[] = [];
  constructor(
    private fetcher: typeof fetch = fetch,
    private clock: () => number = Date.now,
  ) {}

  async review(
    source: JevSource,
    apiKey: string,
  ): Promise<{ review: JevReview; cached: boolean }> {
    const now = this.clock();
    const id = jevSourceId(source);
    const cached = this.cache.get(id);
    if (cached && cached.until > now)
      return { review: cached.review, cached: true };
    if (this.busy)
      throw new JevError(
        "review_busy",
        "Another review is in progress. Wait for it to finish.",
        429,
      );
    this.attempts = this.attempts.filter((t) => now - t < 86_400_000);
    const previous = this.attempts.at(-1);
    if (previous !== undefined && now - previous < 10_000)
      throw new JevError(
        "review_cooldown",
        "Wait 10 seconds between new AI reviews.",
        429,
      );
    if (
      this.attempts.length >= 100 ||
      this.attempts.filter((t) => now - t < 3_600_000).length >= 20
    )
      throw new JevError(
        "review_limit",
        "This server process has reached its review allowance. Try later.",
        429,
      );
    this.attempts.push(now); // Count failed/ambiguous calls too; they may have incurred cost.
    this.busy = true;
    try {
      const review = await evaluateJev(
        source,
        apiKey,
        this.fetcher,
        this.clock,
      );
      for (const [key, entry] of this.cache)
        if (entry.until <= now) this.cache.delete(key);
      if (this.cache.size >= 50)
        this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(id, { until: this.clock() + 600_000, review });
      return { review, cached: false };
    } finally {
      this.busy = false;
    }
  }
}
