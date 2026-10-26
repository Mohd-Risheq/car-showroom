import type { FieldErrors, PlainData } from "@/lib/errors/app-error";
import type { ErrorCode, MessageKey } from "@/lib/errors/codes";

// SRS §8.1's Server Action result. Expected failures are returned, never thrown, so a client
// component reads them from the result; it imports these types alone.

export type ActionResult<Data> =
  { readonly ok: true; readonly data: Data } | { readonly ok: false; readonly error: ActionError };

export type ActionError = {
  readonly code: ErrorCode;
  /** The catalog message the interface shows (§13.2) */
  readonly message: MessageKey;
  readonly fieldErrors?: FieldErrors;
  /** What the client needs to recover, such as API-12's checklist */
  readonly details?: PlainData;
  /** Seconds before a rate-limited call may be tried again */
  readonly retryAfter?: number;
};
