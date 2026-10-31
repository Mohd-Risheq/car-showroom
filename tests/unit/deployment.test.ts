import { notFound } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isDemoMode, isDeployment, notFoundOnDeployments } from "@/lib/deployment";

// SRS §15.1: VERCEL_ENV says whether the code runs on a deployment, where spike and diagnostic pages
// never render (BUILD-PLAN §9.1), and DEMO_MODE turns the demo on only when it is exactly "true" (D-045)

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

describe("isDeployment", () => {
  it("is a preview or a production deployment", () => {
    for (const env of ["preview", "production"]) {
      vi.stubEnv("VERCEL_ENV", env);
      expect(isDeployment(), env).toBe(true);
    }
  });

  it("isn't a local run or vercel dev", () => {
    for (const env of [undefined, "", "development", "Production"]) {
      vi.stubEnv("VERCEL_ENV", env);
      expect(isDeployment(), String(env)).toBe(false);
    }
  });
});

describe("notFoundOnDeployments", () => {
  beforeEach(() => {
    vi.mocked(notFound).mockClear();
  });

  it("answers 404 on a deployment", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    notFoundOnDeployments();
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("lets the page render elsewhere", () => {
    vi.stubEnv("VERCEL_ENV", undefined);
    notFoundOnDeployments();
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("isDemoMode", () => {
  it("is on for exactly true", () => {
    vi.stubEnv("DEMO_MODE", "true");
    expect(isDemoMode()).toBe(true);
  });

  it("is off for anything else, so a client's cars never show the demo banner", () => {
    for (const value of [undefined, "", "false", "1", "TRUE", "True", "yes", " true"]) {
      vi.stubEnv("DEMO_MODE", value);
      expect(isDemoMode(), String(value)).toBe(false);
    }
  });
});
