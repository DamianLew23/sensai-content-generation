export class YoucomApiError extends Error {
  public readonly code = "youcom_api_error";
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly endpoint: string,
  ) {
    super(`youcom ${endpoint} responded ${status}: ${body.slice(0, 200)}`);
    this.name = "YoucomApiError";
  }
}
