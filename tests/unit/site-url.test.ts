import { describe, expect, it, vi } from "vitest";
import { siteOrigin, siteOriginOrNull, siteUrl } from "@/lib/site-url";

// SRS §15.1's NEXT_PUBLIC_SITE_URL: the site's canonical origin, which a car page's Share copies its
// address on (FR-09.11), and which SEC-14's origin check compares a request's Origin with

describe("the site's address", () => {
  it("is the setting's origin, whatever path or slash it is written with", () => {
    for (const setting of ["https://showroom.example", "https://showroom.example/", "https://showroom.example/ar"]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", setting);
      expect(siteOrigin(), setting).toBe("https://showroom.example");
      expect(siteOriginOrNull(), setting).toBe("https://showroom.example");
    }
  });

  it("is null for a check that does without it while the setting is missing", () => {
    for (const setting of [undefined, ""]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", setting);
      expect(siteOriginOrNull(), String(setting)).toBeNull();
    }
  });

  it("takes a page's path", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://showroom.example/ar");
    expect(siteUrl("/en/cars/2019-toyota-land-cruiser-gxr-mu-3hk8")).toBe(
      "https://showroom.example/en/cars/2019-toyota-land-cruiser-gxr-mu-3hk8",
    );
  });

  it("isn't made up when the setting is missing", () => {
    for (const setting of [undefined, ""]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", setting);
      expect(() => siteUrl("/en"), String(setting)).toThrow("NEXT_PUBLIC_SITE_URL is not set");
    }
  });
});
