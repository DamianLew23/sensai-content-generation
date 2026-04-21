export { HttpError } from "../http-error";

export class DataForSeoApiError extends Error {
  constructor(public readonly statusCode: number, public readonly statusMessage: string) {
    super(`DataForSEO ${statusCode}: ${statusMessage}`);
    this.name = "DataForSeoApiError";
  }
}
