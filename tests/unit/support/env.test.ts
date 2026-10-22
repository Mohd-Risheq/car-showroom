import { describe, expect, it, vi } from "vitest";
import { requireEnv } from "../../support/env.ts";

// A missing setting stops an integration test file with its name and where it comes from

describe("requireEnv", () => {
  it("returns the variable's value", () => {
    vi.stubEnv("MUFTAH_TEST_SETTING", "postgres://local");
    expect(requireEnv("MUFTAH_TEST_SETTING")).toBe("postgres://local");
  });

  it.each([undefined, ""])("names the env file and CI's env when the variable is %j", (value) => {
    vi.stubEnv("MUFTAH_TEST_SETTING", value);
    expect(() => requireEnv("MUFTAH_TEST_SETTING")).toThrow(
      "MUFTAH_TEST_SETTING isn't set. It comes from .env.test.local locally (see .env.example), and the workflow's env in CI",
    );
  });

  it("names the source it is given, such as a setup file", () => {
    vi.stubEnv("MUFTAH_TEST_SETTING", undefined);
    expect(() => requireEnv("MUFTAH_TEST_SETTING", "tests/support/storage-root.ts")).toThrow(
      "MUFTAH_TEST_SETTING isn't set. It comes from tests/support/storage-root.ts",
    );
  });
});
