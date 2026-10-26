import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";
import { ERROR_CODES, type ErrorCode } from "@/lib/errors/codes";
import { logRefusal } from "@/lib/errors/refusal";
import type { LogLevel } from "@/lib/log/logger";

// A refusal's log line (NFR-OBS-01): a server's failure is an error, a refused sign-in or
// permission a warning, any other refusal news. Every code is listed, so a new one needs its level.

const LEVELS = {
  VALIDATION_ERROR: "info",
  UNAUTHENTICATED: "warn",
  FORBIDDEN: "warn",
  NOT_FOUND: "info",
  VERSION_CONFLICT: "info",
  INVALID_TRANSITION: "info",
  CAP_REACHED: "info",
  METADATA_PRESENT: "info",
  RATE_LIMITED: "info",
  STEP_UP_REQUIRED: "warn",
  UPSTREAM_UNAVAILABLE: "error",
  INTERNAL: "error",
} as const satisfies Record<ErrorCode, LogLevel>;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logRefusal", () => {
  it.each(Object.keys(ERROR_CODES) as ErrorCode[])("logs %s once, at its level, with its reason", (code) => {
    const level = LEVELS[code];
    const written = (["debug", "info", "warn", "error"] as const).map((name) =>
      vi.spyOn(console, name).mockImplementation(() => {}),
    );
    const error =
      code === "RATE_LIMITED" ? new AppError(code, "the reason", { retryAfter: 1 }) : new AppError(code, "the reason");
    logRefusal(error, { action: "testAction", requestId: "fra1::abc-123", durationMs: 4 });
    expect(written.map((spy) => spy.mock.calls.length)).toStrictEqual(
      (["debug", "info", "warn", "error"] as const).map((name) => (name === level ? 1 : 0)),
    );
    const line = written.find((spy) => spy.mock.calls.length === 1)?.mock.calls[0]?.[0];
    expect(JSON.parse(String(line))).toStrictEqual({
      level,
      code,
      action: "testAction",
      requestId: "fra1::abc-123",
      durationMs: 4,
      reason: "the reason",
    });
  });
});
