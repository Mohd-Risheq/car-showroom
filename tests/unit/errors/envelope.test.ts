import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";
import { withErrorEnvelope } from "@/lib/errors/envelope";

// SRS §8.1's Route Handler error envelope, §13.2 and §11.9: every caught error logged once

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.restoreAllMocks();
});

function call(outcome: Response | Error, headers: Record<string, string> = {}, logClientRefusals = true) {
  const handler = withErrorEnvelope(
    "/api/example",
    async () => {
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
    { logClientRefusals },
  );
  return handler(new Request("https://muftah.test/api/example", { method: "POST", headers }));
}

function quiet() {
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {});
}

describe("withErrorEnvelope", () => {
  it("passes the handler's own response through", async () => {
    const response = await call(new Response(null, { status: 204 }));
    expect(response.status).toBe(204);
  });

  it("answers an AppError with its code, its catalog message and a request ID", async () => {
    quiet();
    const response = await call(new AppError("FORBIDDEN", "not same-origin"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: "FORBIDDEN", message: "errors.code.forbidden", requestId: expect.stringMatching(UUID) },
    });
  });

  it("lists each field's issue, with the values its message shows", async () => {
    quiet();
    const error = new AppError("VALIDATION_ERROR", "settings", {
      fieldErrors: {
        email: [{ key: "validation.email" }],
        fuelPrice95: [{ key: "validation.range", values: { min: 0, max: 5 } }],
      },
    });
    expect(((await (await call(error)).json()) as { error: { details: unknown } }).error.details).toEqual([
      { field: "email", issue: "validation.email" },
      { field: "fuelPrice95", issue: "validation.range", values: { min: 0, max: 5 } },
    ]);
  });

  it("sends Retry-After with a rate limit", async () => {
    quiet();
    const response = await call(new AppError("RATE_LIMITED", "autosave", { retryAfter: 30 }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
  });

  it("logs a refusal once, with its reason, which stays out of the answer", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await call(new AppError("FORBIDDEN", "account guard"), {
      "x-vercel-id": "fra1::iad1::abcde-1760000000000-0123456789ab",
    });
    expect(warned).toHaveBeenCalledOnce();
    expect(JSON.parse(String(warned.mock.calls[0]?.[0]))).toEqual({
      level: "warn",
      code: "FORBIDDEN",
      route: "/api/example",
      reason: "account guard",
      requestId: "fra1::iad1::abcde-1760000000000-0123456789ab",
      durationMs: expect.any(Number),
    });
    expect(JSON.stringify(await response.json())).not.toContain("account guard");
  });

  it("logs other client errors at info and server errors at error", async () => {
    const informed = vi.spyOn(console, "info").mockImplementation(() => {});
    const failed = vi.spyOn(console, "error").mockImplementation(() => {});
    await call(new AppError("VALIDATION_ERROR", "not JSON"));
    await call(new AppError("UPSTREAM_UNAVAILABLE", "vPIC"));
    expect(informed).toHaveBeenCalledOnce();
    expect(failed).toHaveBeenCalledOnce();
  });

  it("leaves out of the log a client's refusal where the route asks, never a server's (API-34)", async () => {
    const lines = (["info", "warn", "error"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    expect((await call(new AppError("FORBIDDEN", "not same-origin"), {}, false)).status).toBe(403);
    expect((await call(new AppError("VALIDATION_ERROR", "not JSON"), {}, false)).status).toBe(400);
    for (const line of lines) expect(line).not.toHaveBeenCalled();
    expect((await call(new AppError("UPSTREAM_UNAVAILABLE", "vPIC"), {}, false)).status).toBe(502);
    expect(lines[2]).toHaveBeenCalledOnce();
  });

  it("rethrows anything else, which Next answers with an empty 500 and passes to onRequestError (§13.4)", async () => {
    await expect(call(new Error("boom"))).rejects.toThrow("boom");
  });
});
