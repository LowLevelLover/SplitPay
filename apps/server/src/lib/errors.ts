/** Thrown by services for expected, client-facing failures (maps to HTTP 4xx). */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}
