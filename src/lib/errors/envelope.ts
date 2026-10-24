import "server-only";

// The Route Handler error envelope (SRS §8.1), whose request ID is the platform's x-vercel-id, or a
// new UUID locally (SRS §13.4). The code goes out, never the reason. T-16's AppError builds on it,
// with the catalog message.

/** SRS §8.1's error codes that route handlers answer with so far, and their statuses */
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CAP_REACHED: 409,
  METADATA_PRESENT: 422,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export function errorResponse(request: Request, code: ErrorCode): Response {
  const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();
  return Response.json({ error: { code, requestId } }, { status: ERROR_STATUS[code] });
}
