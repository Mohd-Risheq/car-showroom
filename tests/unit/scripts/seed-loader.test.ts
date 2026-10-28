import { describe, expect, it } from "vitest";
import { seedOptions } from "../../../scripts/seed-loader.ts";

// What scripts/seed.ts reads from its environment and arguments: the demo loads only when
// DEMO_MODE is "true" and DEALER_SLUG is the demo dealer's (SRS §6.4), and each flag sets its own
// option

const DEMO = { DEMO_MODE: "true", DEALER_SLUG: "muftah" };

describe("seedOptions", () => {
  it("loads the demo when DEMO_MODE is true and DEALER_SLUG is the demo dealer's", () => {
    expect(seedOptions(DEMO, [], "muftah")).toStrictEqual({ demo: true, partial: false, resetSettings: false });
  });

  it("loads the reference data alone for another dealer, or without DEMO_MODE=true", () => {
    for (const environment of [
      { ...DEMO, DEALER_SLUG: "another-dealer" },
      { DEALER_SLUG: "muftah" },
      { DEMO_MODE: "true" },
      { ...DEMO, DEMO_MODE: "false" },
      { ...DEMO, DEMO_MODE: "1" },
      { ...DEMO, DEMO_MODE: "TRUE" },
      { ...DEMO, DEMO_MODE: "" },
      {},
    ]) {
      expect(seedOptions(environment, [], "muftah").demo, JSON.stringify(environment)).toBe(false);
    }
  });

  it("sets each flag's own option and no other", () => {
    expect(seedOptions(DEMO, ["--partial"], "muftah")).toStrictEqual({
      demo: true,
      partial: true,
      resetSettings: false,
    });
    expect(seedOptions({}, ["--reset-settings"], "muftah")).toStrictEqual({
      demo: false,
      partial: false,
      resetSettings: true,
    });
    expect(seedOptions(DEMO, ["--partial", "--reset-settings"], "muftah")).toStrictEqual({
      demo: true,
      partial: true,
      resetSettings: true,
    });
    // Only the flags themselves count
    expect(seedOptions(DEMO, ["--partial=false", "partial", "--reset"], "muftah")).toStrictEqual({
      demo: true,
      partial: false,
      resetSettings: false,
    });
  });
});
