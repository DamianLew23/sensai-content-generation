export class Crawl4aiApiError extends Error {
  public readonly code = "crawl4ai_api_error";
  constructor(message: string) {
    super(`crawl4ai: ${message}`);
    this.name = "Crawl4aiApiError";
  }
}
