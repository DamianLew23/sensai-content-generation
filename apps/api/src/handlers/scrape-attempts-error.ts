import type { ScrapeAttempt } from "@sensai/shared";

/**
 * Rzucany przez scrapeWithFallback gdy obie próby (crawl4ai + firecrawl) zawiodły.
 * ScrapeFetchHandler.execute rozpakowuje attempts[] do ScrapeFailure.
 */
export class ScrapeAttemptsError extends Error {
  constructor(
    public readonly attempts: ScrapeAttempt[],
    public readonly cause: unknown,
  ) {
    super(`All scrape attempts failed (${attempts.length} attempts)`);
    this.name = "ScrapeAttemptsError";
  }
}
