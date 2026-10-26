import { expect, it } from "vitest";
import config from "../../next.config.ts";

// D-039: with Turbopack's build cache on, a build sometimes kept the stylesheet from before an edit
// to globals.css, so the checks that ran on it tested old CSS.
it("builds without Turbopack's file-system cache", () => {
  expect(config.experimental?.turbopackFileSystemCacheForBuild).toBe(false);
});

// SRS §11.4: the cached public functions' profile. Writes refresh entries through tags, so a day's
// revalidate lets the database sleep between visits, and 60 seconds of stale keeps the freshness
// promises of FR-04.6 and FR-34.4 for visitors already browsing
it("defines the catalog profile the cached public functions use", () => {
  expect(config.cacheLife?.["catalog"]).toStrictEqual({ stale: 60, revalidate: 86_400, expire: 2_592_000 });
});
