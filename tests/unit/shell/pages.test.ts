import { describe, expect, it } from "vitest";
import { pagePath } from "@/features/shell/domain/pages";

// SRS §9.2's public pages, each under its locale, which the header and footer link to from T-19 on

describe("pagePath", () => {
  it("puts Home at its locale's root", () => {
    expect(pagePath("ar", "home")).toBe("/ar");
    expect(pagePath("en", "home")).toBe("/en");
  });

  it("puts every other page under its locale", () => {
    const pages = ["cars", "compare", "visit", "garage", "howBuilt", "privacy", "credits", "demo"] as const;
    expect(pages.map((page) => pagePath("en", page))).toStrictEqual([
      "/en/cars",
      "/en/compare",
      "/en/visit",
      "/en/garage",
      "/en/how-its-built",
      "/en/privacy",
      "/en/credits",
      "/en/demo",
    ]);
    expect(pagePath("ar", "howBuilt")).toBe("/ar/how-its-built");
  });
});
