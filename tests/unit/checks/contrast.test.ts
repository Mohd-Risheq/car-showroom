import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import {
  blockName,
  checkPairs,
  contrastRatio,
  hexColour,
  type Pair,
  type PairList,
  parsePairs,
  ratioProblem,
  tokenBlocks,
} from "../../../scripts/checks/contrast.ts";

// check:contrast's rules (NFR-A11Y-01, DESIGN §3.1, §3.2 and §4.5), then pnpm check:contrast on the
// planted and clean fixtures in tests/fixtures/checks/contrast

const FIXTURES = "tests/fixtures/checks/contrast";

/** Each block's tokens as a plain object, with the problems */
function read(css: string) {
  const { blocks, problems } = tokenBlocks(css);
  return {
    blocks: Object.fromEntries([...blocks].map(([name, tokens]) => [name, Object.fromEntries(tokens)])),
    problems,
  };
}

const pair = (fields: Partial<Pair> = {}): Pair => ({
  scope: "public",
  fg: "--ink",
  bg: "--bg",
  min: 4.5,
  design: "DESIGN §3.1 --ink",
  ...fields,
});
const check = (css: string, scopes: PairList["scopes"], pairs: Array<Partial<Pair>>) =>
  checkPairs(tokenBlocks(css).blocks, { scopes, pairs: pairs.map(pair) });
const rgb = (hex: string) => hexColour(hex) ?? [Number.NaN, Number.NaN, Number.NaN];

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

describe("contrastRatio and hexColour", () => {
  it("gives WCAG 2's ratios, the order of the two colours aside", () => {
    expect(contrastRatio(rgb("#000"), rgb("#fff"))).toBe(21);
    expect(contrastRatio(rgb("#fff"), rgb("#000"))).toBe(21);
    expect(contrastRatio(rgb("#5cc8db"), rgb("#5CC8DB"))).toBe(1);
    // DESIGN §3.1 --line on --bg, and §3.2's white text on --accent
    expect(contrastRatio(rgb("#66778E"), rgb("#0B0D10")).toFixed(4)).toBe("4.2568");
    expect(contrastRatio(rgb("#FFFFFF"), rgb("#1A6E7E")).toFixed(4)).toBe("5.8732");
  });

  it("reads only opaque #RGB and #RRGGBB colours", () => {
    expect(hexColour("#fff")).toStrictEqual([255, 255, 255]);
    expect(hexColour("#1a6")).toStrictEqual([17, 170, 102]);
    expect(hexColour("#1A6E7E")).toStrictEqual([26, 110, 126]);
    for (const text of ["#0008", "#eef2f680", "#12345", "fff", "rgb(0 0 0)", "var(--bg)"]) {
      expect(hexColour(text), text).toBeUndefined();
    }
  });
});

describe("ratioProblem", () => {
  it("passes a pair exactly at its minimum", () => {
    expect(ratioProblem(pair(), 4.5)).toBeUndefined();
    expect(ratioProblem(pair({ fg: "--line", min: 3 }), 3)).toBeUndefined();
  });

  it("fails a pair just under its minimum, showing enough decimals to tell", () => {
    expect(ratioProblem(pair(), 4.4952)).toBe(
      "--ink on --bg is 4.495:1, below its minimum of 4.5:1 (DESIGN §3.1 --ink)",
    );
    expect(ratioProblem(pair(), 4.49999)).toBe(
      "--ink on --bg is 4.49999:1, below its minimum of 4.5:1 (DESIGN §3.1 --ink)",
    );
  });

  it("holds a UI pair to 3:1 and a text pair to 4.5:1", () => {
    expect(ratioProblem(pair({ fg: "--line", min: 3 }), 3.19)).toBeUndefined();
    expect(ratioProblem(pair(), 3.19)).toBe("--ink on --bg is 3.19:1, below its minimum of 4.5:1 (DESIGN §3.1 --ink)");
  });

  it("checks a stated ratio at the precision DESIGN writes it in", () => {
    expect(ratioProblem(pair({ stated: "17.3" }), 17.2958)).toBeUndefined();
    expect(ratioProblem(pair({ stated: "17.3" }), 17.24)).toBe(
      "--ink on --bg is 17.2:1, but DESIGN states 17.3:1 (DESIGN §3.1 --ink)",
    );
    expect(ratioProblem(pair({ stated: "9.95" }), 9.9508)).toBeUndefined();
    expect(ratioProblem(pair({ stated: "9.95" }), 9.944)).toBe(
      "--ink on --bg is 9.94:1, but DESIGN states 9.95:1 (DESIGN §3.1 --ink)",
    );
    expect(ratioProblem(pair({ stated: "5" }), 5.4)).toBeUndefined();
    expect(ratioProblem(pair({ stated: "5" }), 5.6)).toBe(
      "--ink on --bg is 6:1, but DESIGN states 5:1 (DESIGN §3.1 --ink)",
    );
  });
});

describe("checkPairs", () => {
  it("layers a scope's blocks in order and resolves var() after the layering", () => {
    const css = `:root { --bg: #0b0d10; --scan: #5cc8db; --focus: var(--scan) }
[data-accent="mint"] { --scan: #5fd3a6 }`;
    const { results, problems } = check(css, { public: [":root"], mint: [":root", "[data-accent='mint']"] }, [
      { fg: "--focus" },
      { scope: "mint", fg: "--focus" },
    ]);
    expect(results.map(({ ratio }) => ratio.toFixed(2))).toStrictEqual(["9.95", "10.52"]);
    expect(problems).toStrictEqual([]);
  });

  it("takes a var() fallback only when the token is not defined", () => {
    const css = ":root { --bg: #0b0d10; --ink: var(--missing, #eef2f6); --muted: var(--bg, #eef2f6) }";
    const { results, problems } = check(css, { public: [":root"] }, [{}, { fg: "--muted" }]);
    expect(results.map(({ ratio }) => ratio.toFixed(2))).toStrictEqual(["17.30", "1.00"]);
    expect(problems).toStrictEqual([
      "public: --muted on --bg is 1.00:1, below its minimum of 4.5:1 (DESIGN §3.1 --ink)",
    ]);
  });

  it("names an undefined token, a var() loop and an unreadable colour, each once", () => {
    const css = ":root { --bg: #0b0d10; --a: var(--b); --b: var(--a); --see-through: #eef2f680 }";
    const { results, problems } = check(css, { public: [":root"] }, [
      {},
      { bg: "--surface-1" },
      { fg: "--a" },
      { fg: "--see-through" },
    ]);
    expect(results).toStrictEqual([]);
    expect(problems).toStrictEqual([
      "public: --ink is not defined",
      "public: --surface-1 is not defined",
      "public: var() loops: --a > --b > --a",
      'public: --see-through is "#eef2f680", not an opaque #RGB or #RRGGBB colour',
    ]);
  });

  it("names a scope's missing block once, and checks none of its pairs", () => {
    const { results, problems } = check(
      ":root { --bg: #f3f5f7; --ink: #0e1217 }",
      {
        daylight: [":root", '[data-theme="daylight"]'],
      },
      [{ scope: "daylight" }, { scope: "daylight", fg: "--muted" }],
    );
    expect(results).toStrictEqual([]);
    expect(problems).toStrictEqual(['daylight: no block matches [data-theme="daylight"]']);
  });

  it("names a scope the list doesn't define once, and checks none of its pairs", () => {
    const { results, problems } = check(":root { --bg: #0b0d10; --ink: #eef2f6 }", { public: [":root"] }, [
      { scope: "workspace" },
      { scope: "workspace", fg: "--muted" },
    ]);
    expect(results).toStrictEqual([]);
    expect(problems).toStrictEqual(["no scope is named workspace"]);
  });

  it("reads a colour written in the pair itself", () => {
    const { results, problems } = check(
      '[data-theme="daylight"] { --accent: #1a6e7e }',
      {
        daylight: ['[data-theme="daylight"]'],
      },
      [{ scope: "daylight", fg: "#FFFFFF", bg: "--accent", stated: "5.87" }],
    );
    expect(results.map(({ ratio }) => ratio.toFixed(4))).toStrictEqual(["5.8732"]);
    expect(problems).toStrictEqual([]);
  });
});

describe("parsePairs", () => {
  it("accepts the fixture's 47 pairs, which hold text to 4.5:1 and lines to 3:1", () => {
    const list = parsePairs(JSON.parse(readFileSync(`${FIXTURES}/pairs.json`, "utf8")), "pairs.json");
    if (typeof list === "string") throw new Error(list);
    expect(list.pairs).toHaveLength(47);
    for (const { fg, min } of list.pairs) expect(min, fg).toBe(fg === "--line" ? 3 : 4.5);
  });

  it("refuses a pair outside any scope, under 3:1, with a ratio not as DESIGN writes it or no DESIGN source", () => {
    const problem = parsePairs(
      {
        scopes: { public: [":root"] },
        pairs: [{ scope: "dusk", fg: "--ink", bg: "--bg", min: 2, stated: "4.5:1", design: "SRS §1" }],
      },
      "pairs.json",
    );
    expect(typeof problem).toBe("string");
    expect(problem).toMatch(/^pairs\.json is not valid:\n/);
    for (const issue of [
      "no scope is named dusk",
      "WCAG asks at least 3:1 of any pair",
      'the ratio as DESIGN writes it, such as "4.26"',
      "the DESIGN section the pair comes from",
    ]) {
      expect(problem).toContain(issue);
    }
  });
});

describe("pnpm check:contrast", () => {
  const run = (tokens: string, pairs = `${FIXTURES}/pairs.json`) =>
    spawnSync(process.execPath, ["scripts/check-contrast.ts", tokens, "--pairs", pairs], { encoding: "utf8" });
  const planted = `${FIXTURES}/planted/tokens.css`;

  it("fails on the planted problems, naming the file, scope, colours and DESIGN rule", () => {
    const result = run(planted);
    expect(result.status).toBe(1);
    expect(result.stderr.trim().split("\n")).toStrictEqual(
      [
        "public: --line on --bg is 4.03:1, but DESIGN states 4.26:1 (DESIGN §3.1 --line)",
        "public: --line on --surface-1 is 3.76:1, but DESIGN states 3.97:1 (DESIGN §3.1 --line)",
        "public: --line on --surface-2 is 3.43:1, but DESIGN states 3.62:1 (DESIGN §3.1 --line)",
        "public: --line on --surface-3 is 2.996:1, below its minimum of 3:1 (DESIGN §3.1 --line)",
        "public: --meta on --bg is 6.55:1, but DESIGN states 6.15:1 (DESIGN §3.1 --meta)",
        "public: --meta on --surface-3 is 4.88:1, but DESIGN states 4.58:1 (DESIGN §3.1 --meta)",
        "accent-electric_blue: --scan on --bg is 6.04:1, but DESIGN states 8.15:1 (DESIGN §3.1 dealer accent presets: electric_blue)",
        "accent-electric_blue: --scan on --surface-3 is 4.495:1, below its minimum of 4.5:1 (DESIGN §3.1 dealer accent presets: electric_blue, the lowest preset pair)",
        "accent-mint: --mint is not defined",
        'accent-ivory: --scan is "rgb(232 226 208)", not an opaque #RGB or #RRGGBB colour',
        "accent-violet: var() loops: --scan > --violet > --scan",
        "public-more-contrast: no block matches @media (prefers-contrast: more) :root",
        "daylight: --ink on --bg is 1.03:1, below its minimum of 4.5:1 (DESIGN §3.2 Daylight --ink)",
      ].map((problem) => `${planted}: ${problem}`),
    );
  });

  it("passes the clean fixture, showing the pairs closest to each minimum", () => {
    const result = run(`${FIXTURES}/clean/tokens.css`);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      [
        "check:contrast: 47 pairs in 7 scopes reach their minimums and DESIGN's ratios",
        "  closest to 3:1: public --line on --surface-3, 3.17:1",
        "  closest to 4.5:1: public --meta on --surface-3, 4.58:1",
        "",
      ].join("\n"),
    );
  });

  it("names a missing or unreadable file instead of throwing", () => {
    const folder = mkdtempSync(path.join(tmpdir(), "check-contrast-"));
    onTestFinished(() => rmSync(folder, { recursive: true, force: true }));
    const missing = run(path.join(folder, "tokens.css"), path.join(folder, "pairs.json"));
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("/tokens.css is missing\n");
    expect(missing.stderr).toContain("/pairs.json is missing\n");

    writeFileSync(path.join(folder, "pairs.json"), "{");
    const badJson = run(`${FIXTURES}/clean/tokens.css`, path.join(folder, "pairs.json"));
    expect(badJson.status).toBe(1);
    expect(badJson.stderr).toMatch(/\/pairs\.json: not valid JSON \(/);

    writeFileSync(path.join(folder, "tokens.css"), ":root {\n  --bg: #0b0d10;\n");
    const unclosed = run(path.join(folder, "tokens.css"));
    expect(unclosed.status).toBe(1);
    expect(unclosed.stderr).toMatch(/\/tokens\.css: line 1: :root \{ is never closed\n$/);
    for (const result of [missing, badJson, unclosed]) expect(result.stderr).not.toMatch(/\n\s+at /);
  });
});
