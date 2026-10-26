import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors/app-error";
import { ERROR_CODES } from "@/lib/errors/codes";

// SRS §8.1's codes and statuses, §13.2's message keys and §13.4's AppError

describe("ERROR_CODES", () => {
  it("holds SRS §8.1's twelve codes with their statuses", () => {
    expect(Object.fromEntries(Object.entries(ERROR_CODES).map(([code, { status }]) => [code, status]))).toEqual({
      VALIDATION_ERROR: 400,
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      VERSION_CONFLICT: 409,
      INVALID_TRANSITION: 409,
      CAP_REACHED: 409,
      METADATA_PRESENT: 422,
      RATE_LIMITED: 429,
      STEP_UP_REQUIRED: 403,
      UPSTREAM_UNAVAILABLE: 502,
      INTERNAL: 500,
    });
  });

  it("shows errors.code.<the code in camelCase> unless an error names another message (§13.2)", () => {
    for (const [code, { message }] of Object.entries(ERROR_CODES)) {
      const camelCase = code.toLowerCase().replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
      expect(message).toBe(`errors.code.${camelCase}`);
    }
  });
});

describe("AppError", () => {
  it("takes its status and message from its code, and keeps the reason as its own message", () => {
    const error = new AppError("VERSION_CONFLICT", "stale version");
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: "AppError",
      code: "VERSION_CONFLICT",
      status: 409,
      messageKey: "errors.code.versionConflict",
      message: "stale version",
    });
    expect(error.fieldErrors).toBeUndefined();
    expect(error.retryAfter).toBeUndefined();
  });

  it("carries a more specific message, field errors, details and a retry time", () => {
    const fieldErrors = { priceJod: [{ key: "validation.price" as const }] };
    const error = new AppError("CAP_REACHED", "demo cars", { message: "demo.cap.cars", fieldErrors, details: [1] });
    expect(error).toMatchObject({ messageKey: "demo.cap.cars", fieldErrors, details: [1] });
    expect(new AppError("RATE_LIMITED", "autosave", { retryAfter: 12 }).retryAfter).toBe(12);
  });

  it("needs the seconds with RATE_LIMITED, which answers with Retry-After, and takes them with no other code", () => {
    // @ts-expect-error: RATE_LIMITED's answer carries the seconds in Retry-After (SRS §8.1)
    expect(new AppError("RATE_LIMITED", "autosave").retryAfter).toBeUndefined();
    // @ts-expect-error: no other code sends Retry-After
    expect(new AppError("FORBIDDEN", "role", { retryAfter: 12 }).retryAfter).toBe(12);
  });

  it("carries plain data in its details, which reach the client as they are", () => {
    class Money {
      readonly amount: number;
      constructor(amount: number) {
        this.amount = amount;
      }
    }
    const at = new Date(0);
    expect(new AppError("VERSION_CONFLICT", "r", { details: { at, list: [1, "a", null] } }).details).toEqual({
      at,
      list: [1, "a", null],
    });
    // @ts-expect-error: a class instance can't cross to the client, whose call would reject
    expect(new AppError("CAP_REACHED", "r", { details: { price: new Money(1) } }).details).toBeDefined();
  });
});
