import { describe, expect, it } from "vitest";
import { blockName, tokenBlocks } from "@/styles/token-blocks";

// How src/styles/token-blocks.ts reads a stylesheet's custom properties, block by block

/** Each block's tokens as a plain object, with the problems */
function read(css: string) {
  const { blocks, problems } = tokenBlocks(css);
  return {
    blocks: Object.fromEntries([...blocks].map(([name, tokens]) => [name, Object.fromEntries(tokens)])),
    problems,
  };
}

describe("tokenBlocks", () => {
  it("reads the custom properties of each block, and nothing else", () => {
    const css = `@import "tailwindcss";
:root { --bg: #0b0d10; color: red; --ink: #eef2f6 }`;
    expect(read(css)).toStrictEqual({ blocks: { ":root": { "--bg": "#0b0d10", "--ink": "#eef2f6" } }, problems: [] });
  });

  it("names a nested block by its at-rules and selector, and gives each selector of a list the block", () => {
    const css = `@media (prefers-contrast: more) { :root, [data-theme="dark"] { --line: #8a9ab0; } }
:root { @media (prefers-contrast: more) { --line: #8a9ab0 } }
:is(.a, .b) { --line: #66778e }
@media (prefers-contrast: more), (forced-colors: active) { :root { --line: #8a9ab0 } }`;
    expect(Object.keys(read(css).blocks)).toStrictEqual([
      "@media (prefers-contrast: more) :root",
      '@media (prefers-contrast: more) [data-theme="dark"]',
      ":root @media (prefers-contrast: more)",
      ":is(.a, .b)",
      "@media (prefers-contrast: more), (forced-colors: active) :root",
    ]);
  });

  it("names a block the same however it is spaced or quoted", () => {
    const css = `[data-accent = 'mint'] { --scan: #5fd3a6 }
[data-accent=ivory]
  { --scan: #e8e2d0 }`;
    expect(Object.keys(read(css).blocks)).toStrictEqual(['[data-accent="mint"]', '[data-accent="ivory"]']);
    expect(blockName("@media  (prefers-contrast: more)\n  :root")).toBe("@media (prefers-contrast: more) :root");
  });

  it("lets a later declaration win, in a block and across blocks of one name", () => {
    expect(read(":root { --line: #66778e; --line: #8a9ab0 }").blocks).toStrictEqual({
      ":root": { "--line": "#8a9ab0" },
    });
    expect(read(":root { --line: #66778e; --ink: #eef2f6 } :root { --line: #8a9ab0 }").blocks).toStrictEqual({
      ":root": { "--line": "#8a9ab0", "--ink": "#eef2f6" },
    });
  });

  it("keeps strings, parentheses and comments from ending a declaration or a block", () => {
    const css = `:root {
  --font: "Readex Pro; {x}", system-ui;
  --icon: url(data:image/svg+xml;utf8,<svg></svg>);
  /* --bg: #fff; } */
  --quote: 'it\\'s; fine';
  --bg: #0b0d10 !important;
  --ink: #eef2f6
}`;
    expect(read(css)).toStrictEqual({
      blocks: {
        ":root": {
          "--font": '"Readex Pro; {x}", system-ui',
          "--icon": "url(data:image/svg+xml;utf8,<svg></svg>)",
          "--quote": "'it\\'s; fine'",
          "--bg": "#0b0d10",
          "--ink": "#eef2f6",
        },
      },
      problems: [],
    });
  });

  it("reports what keeps a stylesheet from being read, with its line", () => {
    expect(read(":root {\n  --bg: #000;\n").problems).toStrictEqual(["line 1: :root { is never closed"]);
    expect(read(":root { --bg: #000; }\n}").problems).toStrictEqual(["line 2: this } closes no block"]);
    expect(read(":root { --bg: #000; }\n/* a note").problems).toStrictEqual(["line 2: this comment is never closed"]);
    expect(read(':root {\n  --font: "Readex;\n}').problems).toStrictEqual([
      "line 2: this string is never closed",
      "line 1: :root { is never closed",
    ]);
  });
});
