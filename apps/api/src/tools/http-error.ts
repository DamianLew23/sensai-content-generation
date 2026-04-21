export class HttpError extends Error {
  public readonly code: string;
  constructor(public readonly status: number, public readonly body: string) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = "HttpError";
    this.code = `http_${status}`;
  }
}
