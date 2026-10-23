import { expect, it } from "vitest";
import config from "../../next.config.ts";

// D-039: with Turbopack's build cache on, a build sometimes kept the stylesheet from before an edit
// to globals.css, so the checks that ran on it tested old CSS.
it("builds without Turbopack's file-system cache", () => {
  expect(config.experimental?.turbopackFileSystemCacheForBuild).toBe(false);
});
