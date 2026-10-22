import { describe, expect, it, vi } from "vitest";
import { describeError, round, watchViolations } from "@/app/_dev/harness";

// The helpers the spike pages share: the numbers and error lines their reports hold, and the
// Content Security Policy violations they collect

describe("round", () => {
  it("rounds to one place unless told otherwise", () => {
    expect(round(1.26)).toBe(1.3);
    expect(round(-1.24)).toBe(-1.2);
  });

  it.each([
    [7.5, 0, 8],
    [1234.5678, 2, 1234.57],
    [0.0123456, 3, 0.012],
  ])("rounds %d to %d places as %d", (value, digits, expected) => {
    expect(round(value, digits)).toBe(expected);
  });
});

describe("describeError", () => {
  it.each([
    ["an error", new TypeError("Load failed"), "TypeError: Load failed"],
    [
      "a camera refusal",
      new DOMException("Permission denied", "NotAllowedError"),
      "NotAllowedError: Permission denied",
    ],
    ["a string", "worker error", "worker error"],
    ["a number", 42, "42"],
  ])("gives %s as one line", (_case, error, expected) => {
    expect(describeError(error)).toBe(expected);
  });
});

describe("watchViolations", () => {
  const violation = (effectiveDirective: string, blockedURI: string) =>
    Object.assign(new Event("securitypolicyviolation"), { effectiveDirective, blockedURI });

  it("gives one line per violation until it is stopped", () => {
    const page = new EventTarget();
    vi.stubGlobal("document", page);
    const lines: string[] = [];
    const stop = watchViolations((line) => lines.push(line));
    page.dispatchEvent(violation("connect-src", "https://cdn.jsdelivr.net/npm/x.wasm"));
    page.dispatchEvent(violation("style-src-elem", ""));
    stop();
    page.dispatchEvent(violation("img-src", "https://example.com/late.png"));
    expect(lines).toStrictEqual([
      "connect-src blocked https://cdn.jsdelivr.net/npm/x.wasm",
      "style-src-elem blocked inline",
    ]);
  });
});
