export class HttpError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = "HttpError";
  }
}

export class DataForSeoApiError extends Error {
  constructor(public readonly statusCode: number, public readonly statusMessage: string) {
    super(`DataForSEO ${statusCode}: ${statusMessage}`);
    this.name = "DataForSeoApiError";
  }
}
