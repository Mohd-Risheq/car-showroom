import "server-only";
import { ERROR_STATUS, type ErrorCode, errorResponse } from "@/lib/errors/envelope";

// Typed storage failures with the SRS §8.1 codes. T-16's lib/errors (AppError, with the
// catalog message) takes these over.

export type StorageErrorCode = ErrorCode;

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly status: number;

  // The reason is for logs and tests only; responses carry the code
  constructor(code: StorageErrorCode, reason: string) {
    super(reason);
    this.name = "StorageError";
    this.code = code;
    this.status = ERROR_STATUS[code];
  }
}

/** A storage failure in the Route Handler error envelope (SRS §8.1) */
export function storageErrorResponse(request: Request, error: StorageError): Response {
  return errorResponse(request, error.code);
}
