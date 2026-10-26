import type { MessageKeys, Messages, NestedKeyOf } from "next-intl";

/** Any message in the catalogs */
export type MessageKey = MessageKeys<Messages, NestedKeyOf<Messages>>;

// SRS §8.1's error codes: the status a Route Handler answers with, and the message the interface
// shows unless the error names a more specific one (§13.2: the code in camelCase). Client
// components type an action's failure with these, so the module has no runtime imports.
// UPSTREAM_UNAVAILABLE answers 502; a timeout's 504 comes with withTimeout and the first external
// call (T-28).
export const ERROR_CODES = {
  VALIDATION_ERROR: { status: 400, message: "errors.code.validationError" },
  UNAUTHENTICATED: { status: 401, message: "errors.code.unauthenticated" },
  FORBIDDEN: { status: 403, message: "errors.code.forbidden" },
  NOT_FOUND: { status: 404, message: "errors.code.notFound" },
  VERSION_CONFLICT: { status: 409, message: "errors.code.versionConflict" },
  INVALID_TRANSITION: { status: 409, message: "errors.code.invalidTransition" },
  CAP_REACHED: { status: 409, message: "errors.code.capReached" },
  METADATA_PRESENT: { status: 422, message: "errors.code.metadataPresent" },
  RATE_LIMITED: { status: 429, message: "errors.code.rateLimited" },
  STEP_UP_REQUIRED: { status: 403, message: "errors.code.stepUpRequired" },
  UPSTREAM_UNAVAILABLE: { status: 502, message: "errors.code.upstreamUnavailable" },
  INTERNAL: { status: 500, message: "errors.code.internal" },
} as const satisfies Record<string, { status: number; message: MessageKey }>;

export type ErrorCode = keyof typeof ERROR_CODES;
