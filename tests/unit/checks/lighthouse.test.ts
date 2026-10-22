import { describe, expect, it } from "vitest";
import { lighthousePlan } from "../../../scripts/checks/lighthouse.ts";

// The pages pnpm lhci measures (NFR-PERF-02): the listed paths on the build's origin, with the pages
// not built yet named as pending, never measured

const ORIGIN = "http://localhost:3000";

describe("lighthousePlan", () => {
  it("measures each listed path on the origin, in order, and names the pages with none as pending", () => {
    const rc = {
      pages: [
        { name: "Home", paths: ["/ar", "/en"] },
        { name: "Inventory", paths: [] },
        { name: "Car page", paths: ["/en/cars/sample"] },
      ],
    };
    expect(lighthousePlan(rc, ORIGIN)).toStrictEqual({
      urls: [`${ORIGIN}/ar`, `${ORIGIN}/en`, `${ORIGIN}/en/cars/sample`],
      pending: ["Inventory"],
    });
  });

  it("measures nothing while every page is pending", () => {
    const rc = { pages: [{ name: "Home", paths: [] }] };
    expect(lighthousePlan(rc, ORIGIN)).toStrictEqual({ urls: [], pending: ["Home"] });
  });

  it("refuses a config without pages, or with a path that could leave the site", () => {
    const refusal = /^lighthouserc\.json has no list of pages pnpm lhci can read:\n/;
    expect(lighthousePlan({ ci: {} }, ORIGIN)).toMatch(refusal);
    expect(lighthousePlan({ pages: [] }, ORIGIN)).toMatch(refusal);
    expect(lighthousePlan({ pages: [{ name: "Home", paths: ["en"] }] }, ORIGIN)).toMatch(refusal);
    expect(lighthousePlan({ pages: [{ name: "Home", paths: ["//example.com/en"] }] }, ORIGIN)).toMatch(
      /starting with one \//,
    );
  });

  it("refuses a path the URL parser takes off the site, rather than measuring another site", () => {
    for (const offSite of ["/\\evil.example/en", "/\t/evil.example/en", "/\\["]) {
      expect(lighthousePlan({ pages: [{ name: "Home", paths: [offSite] }] }, ORIGIN)).toMatch(
        /a path that stays on this site/,
      );
    }
  });
});
