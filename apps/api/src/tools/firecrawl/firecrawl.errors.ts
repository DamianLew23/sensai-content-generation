export class FirecrawlApiError extends Error {
  public readonly code = "firecrawl_api_error";
  constructor(message: string) {
    super(`Firecrawl: ${message}`);
    this.name = "FirecrawlApiError";
  }
}
