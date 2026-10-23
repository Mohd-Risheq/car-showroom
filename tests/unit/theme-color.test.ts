import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEME_COLOR } from "@/styles/theme-color";
import { tokenBlocks } from "@/styles/token-blocks";

describe("the theme colours", () => {
  it("are each theme's --bg in tokens.css", () => {
    const { blocks, problems } = tokenBlocks(readFileSync("src/styles/tokens.css", "utf8"));
    expect(problems).toEqual([]);
    expect(blocks.get(":root")?.get("--bg")).toBe(THEME_COLOR.dark);
    expect(blocks.get('[data-theme="daylight"]')?.get("--bg")).toBe(THEME_COLOR.daylight);
  });
});
