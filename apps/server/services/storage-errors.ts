export class StorageError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 500
  ) {
    super(message);
    this.name = "StorageError";
  }
}

export type StorageErrorStatus = 400 | 404 | 413 | 415 | 429 | 502 | 503;
