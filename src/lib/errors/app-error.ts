import { ERROR_CODES, type ErrorCode, type MessageKey } from "./codes";

/** A field's problem: the catalog message the form shows, with the values it fills in */
export type FieldIssue = { readonly key: MessageKey; readonly values?: Readonly<Record<string, number | string>> };

/** Each field's problems, keyed by the field's name in the input */
export type FieldErrors = Readonly<Partial<Record<string, readonly FieldIssue[]>>>;

/**
 * Plain data, which reaches the client as it is: React carries it to a Server Action's caller, and
 * JSON to a route's. A class instance can't cross, and the call would reject in place of returning
 * the refusal, so the type refuses one. A record without a prototype passes the type and fails the
 * same way: build details from literals.
 */
export type PlainData =
  string | number | boolean | null | undefined | Date | readonly PlainData[] | { readonly [key: string]: PlainData };

type Options = {
  /** A more specific message than the code's, such as demo.cap.cars */
  message?: MessageKey;
  fieldErrors?: FieldErrors;
  /** What the client needs to recover, such as API-12's checklist or API-11's current values */
  details?: PlainData;
};

/** Every code's options but RATE_LIMITED's, which alone answers with Retry-After (SRS §8.1) */
export type AppErrorOptions = Options & { retryAfter?: never };

export type RateLimitedOptions = Options & {
  /** Whole seconds before the request may be tried again, at least 1 (rate-limit/limit.ts) */
  retryAfter: number;
};

// SRS §13.4: a typed error with a code, its HTTP status and a message key. Actions return it in
// their result union and Route Handlers in the error envelope (§8.1). Its own message is the
// reason, for logs and tests only, so it never holds anything a user typed or any personal data.
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly messageKey: MessageKey;
  readonly fieldErrors: FieldErrors | undefined;
  readonly details: PlainData;
  readonly retryAfter: number | undefined;

  constructor(code: "RATE_LIMITED", reason: string, options: RateLimitedOptions);
  constructor(code: Exclude<ErrorCode, "RATE_LIMITED">, reason: string, options?: AppErrorOptions);
  constructor(code: ErrorCode, reason: string, options: Options & { retryAfter?: number } = {}) {
    super(reason);
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_CODES[code].status;
    this.messageKey = options.message ?? ERROR_CODES[code].message;
    this.fieldErrors = options.fieldErrors;
    this.details = options.details;
    this.retryAfter = options.retryAfter;
  }
}
