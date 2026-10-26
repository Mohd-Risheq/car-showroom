import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "@/lib/log/logger";

// NFR-OBS-01: structured JSON lines, filtered by LOG_LEVEL (SRS §15, default info)

afterEach(() => {
  vi.restoreAllMocks();
});

function spies() {
  return {
    debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
    info: vi.spyOn(console, "info").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
}

describe("log", () => {
  it("writes one JSON line through its level's console method", () => {
    const written = spies();
    log("warn", "csp_violation", { route: "/api/csp-report", durationMs: 3 });
    expect(written.warn).toHaveBeenCalledExactlyOnceWith(
      '{"level":"warn","code":"csp_violation","route":"/api/csp-report","durationMs":3}',
    );
    expect(written.info).not.toHaveBeenCalled();
  });

  it("takes no field named level or code, which the line's own would drop", () => {
    spies();
    // @ts-expect-error: a field named code, such as a Node error's code, would be dropped for the event's
    log("error", "media_delete_failed", { code: "ENOENT" });
    // @ts-expect-error: and one named level for the line's level
    log("info", "csp_violation", { level: "error" });
    const record: Record<string, string> = { reason: "gone" };
    // @ts-expect-error: nor fields typed with a string index, which could hold either name
    log("error", "media_delete_failed", record);
  });

  it("keeps the line's own level and code over fields a cast gets past the types", () => {
    const written = spies();
    const fields = { code: "ENOENT", level: "debug", path: "/a" } as unknown as { readonly path: string };
    log("error", "media_delete_failed", fields);
    expect(written.error).toHaveBeenCalledExactlyOnceWith('{"level":"error","code":"media_delete_failed","path":"/a"}');
  });

  it("leaves out a field that has no value", () => {
    const written = spies();
    log("info", "cron_cleanup", { purged: 0, skipped: undefined });
    expect(written.info).toHaveBeenCalledExactlyOnceWith('{"level":"info","code":"cron_cleanup","purged":0}');
  });

  it("writes info and above when LOG_LEVEL is unset or unknown", () => {
    for (const level of [undefined, "verbose"]) {
      vi.stubEnv("LOG_LEVEL", level);
      const written = spies();
      log("debug", "dropped_input");
      log("info", "cron_cleanup");
      expect(written.debug).not.toHaveBeenCalled();
      expect(written.info).toHaveBeenCalledOnce();
      vi.restoreAllMocks();
    }
  });

  it("writes only the levels LOG_LEVEL lets through", () => {
    vi.stubEnv("LOG_LEVEL", "error");
    const written = spies();
    log("warn", "csp_violation");
    log("error", "media_delete_failed");
    expect(written.warn).not.toHaveBeenCalled();
    expect(written.error).toHaveBeenCalledOnce();

    vi.stubEnv("LOG_LEVEL", "debug");
    log("debug", "dropped_input");
    expect(written.debug).toHaveBeenCalledOnce();
  });
});
