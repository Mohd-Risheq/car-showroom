import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { colourOf, layer, parsePairs, type Rgb } from "../../scripts/checks/contrast.ts";
import { tokenBlocks } from "../../src/styles/token-blocks.ts";
import { emulateContrast } from "../support/specimen.ts";

// pnpm check:contrast reads each scope's colours from tokens.css by layering its blocks in the
// stylesheet's order (scripts/checks/contrast.ts). This checks that reading against the browser: with
// a scope's attributes on <html> and its media emulated, the production stylesheet gives every
// colour token the colour the check took its ratios from. A build step that merged or reordered the
// blocks, or a block that stopped applying, shows here.

const PAIRS = "scripts/contrast-pairs.json";
const list = parsePairs(JSON.parse(readFileSync(new URL(`../../${PAIRS}`, import.meta.url), "utf8")), PAIRS);
if (typeof list === "string") throw new Error(list);
const { blocks } = tokenBlocks(readFileSync(new URL("../../src/styles/tokens.css", import.meta.url), "utf8"));

/** The tokens that name a colour on the public site: every one a pair can use */
const COLOURS = [...(blocks.get(":root")?.keys() ?? [])].filter((token) =>
  Array.isArray(colourOf(token, blocks.get(":root") ?? new Map())),
);

type PageState = { theme?: string; accent?: string; moreContrast: boolean };

/** What the page needs for a scope's blocks to apply */
function stateOf(names: readonly string[]): PageState {
  const state: PageState = { moreContrast: false };
  for (const name of names) {
    const media = /^@media \(prefers-contrast: more\) (.+)$/.exec(name);
    if (media) state.moreContrast = true;
    const selector = media?.[1] ?? name;
    const [, attribute, value = ""] = /^\[data-(theme|accent)="([\w-]+)"\]$/.exec(selector) ?? [];
    if (attribute === "theme") state.theme = value;
    else if (attribute === "accent") state.accent = value;
    else if (selector !== ":root") throw new Error(`no page state applies the block ${name}`);
  }
  return state;
}

/** rgb() as the browser computes a colour, or the text when it is anything else */
function channels(colour: string): Rgb | string {
  const [, red, green, blue] = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(colour) ?? [];
  return red && green && blue ? [Number(red), Number(green), Number(blue)] : colour;
}

test("finds the colour tokens", () => {
  expect(COLOURS).toContain("--bg");
  expect(COLOURS).toContain("--scan");
});

for (const [scope, names] of Object.entries(list.scopes)) {
  test(`the browser gives the ${scope} scope the colours the contrast check reads`, async ({ page }) => {
    const layered = layer(blocks, names);
    if ("missing" in layered) throw new Error(`no block matches ${layered.missing.join(", ")}`);
    const { theme, accent, moreContrast } = stateOf(names);
    await page.goto("/en/dev/tokens");
    await emulateContrast(page, moreContrast ? "more" : "no-preference");

    const computed = await page.evaluate(
      ({ tokens, theme, accent }) => {
        const root = document.documentElement;
        if (theme) root.dataset.theme = theme;
        if (accent) root.dataset.accent = accent;
        // A colour property resolves each token as the cascade leaves it under <html>
        const probe = document.createElement("i");
        document.body.append(probe);
        const colours = tokens.map((token) => {
          probe.style.color = `var(${token})`;
          return [token, getComputedStyle(probe).color] as const;
        });
        probe.remove();
        return colours;
      },
      { tokens: COLOURS, theme, accent },
    );

    expect(Object.fromEntries(computed.map(([token, colour]) => [token, channels(colour)]))).toStrictEqual(
      Object.fromEntries(COLOURS.map((token) => [token, colourOf(token, layered.tokens)])),
    );
  });
}
