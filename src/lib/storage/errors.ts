// Typed storage failures with the SRS §8.1 codes. T-16's lib/errors (AppError, with the
// catalog message) takes these over.

const STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CAP_REACHED: 409,
  METADATA_PRESENT: 422,
} as const;

export type StorageErrorCode = keyof typeof STATUS;

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly status: number;

  // The reason is for logs and tests only; responses carry the code
  constructor(code: StorageErrorCode, reason: string) {
    super(reason);
    this.name = "StorageError";
    this.code = code;
    this.status = STATUS[code];
  }
}

// The Route Handler error envelope (SRS §8.1). The request ID is the platform's x-vercel-id,
// or a new UUID locally (SRS §13.4).
export function storageErrorResponse(request: Request, error: StorageError): Response {
  const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();
  return Response.json({ error: { code: error.code, requestId } }, { status: error.status });
}
