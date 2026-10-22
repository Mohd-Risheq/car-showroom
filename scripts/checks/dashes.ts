// C-07: no em dash or en dash in user-facing text. Long dashes of every kind count, since each
// reads as one, and so do the HTML entities and escapes that MDX turns into them. pnpm
// check:dashes (scripts/check-dashes.ts) runs these over the files dashSources lists; the caption
// composers' tests call dashesIn directly (TC-NFR-15).
import { globSync, statSync } from "node:fs";
import path from "node:path";

const NAMES = new Map([
  [0x2012, "figure dash"],
  [0x2013, "en dash"],
  [0x2014, "em dash"],
  [0x2015, "horizontal bar"],
  [0x2e3a, "two-em dash"],
  [0x2e3b, "three-em dash"],
  [0xfe31, "vertical em dash"],
  [0xfe32, "vertical en dash"],
  [0xfe58, "small em dash"],
]);
const CODE_POINTS = [...NAMES.keys()];
// The named HTML entities for long dashes: the HTML standard names no others
const ENTITIES = new Map([
  ["&mdash;", 0x2014],
  ["&ndash;", 0x2013],
  ["&horbar;", 0x2015],
]);

const hexOf = (codePoint: number) => codePoint.toString(16);
const anyOf = (alternatives: string[]) => `(?:${alternatives.join("|")})`;

const DASH = new RegExp(`[${CODE_POINTS.map((codePoint) => `\\u{${hexOf(codePoint)}}`).join("")}]`, "gu");
// In MDX also each dash's entity, its decimal and hexadecimal references, and its escapes in
// expressions, as &mdash; &#8212; &#x2014; \u2014 and \u{2014} are, with any leading zeros
const MDX_DASH = new RegExp(
  [
    DASH.source,
    anyOf([...ENTITIES.keys()]),
    `&#0*${anyOf(CODE_POINTS.map(String))};`,
    `&#x0*${anyOf(CODE_POINTS.map(hexOf))};`,
    `\\\\u${anyOf(CODE_POINTS.map(hexOf))}`,
    `\\\\u\\{0*${anyOf(CODE_POINTS.map(hexOf))}\\}`,
  ].join("|"),
  "giu",
);
// A longer JSON text is quoted in part: this many characters around its dash
const EXCERPT_CHARACTERS = 100;
// The files pnpm check:dashes reads when given none, and the folders it leaves out, which hold no
// user-facing text: dependencies, coverage, the private specification and the checks' own planted
// violations. Globs never enter dot folders such as .next.
const SOURCES = ["messages/*.json", "seed/*.json", "public/seed/credits.json", "**/*.mdx"];
const SKIP = new Set(["node_modules", "coverage", "docs", "tests/fixtures"]);

/** A dash found: what was written and the dash it stands for, as "an em dash (U+2014)" */
export type Dash = { written: string; dash: string };

function dashName(codePoint: number): string {
  const name = NAMES.get(codePoint) ?? "dash";
  const hex = hexOf(codePoint).toUpperCase().padStart(4, "0");
  return `${/^[aeiou]/.test(name) ? "an" : "a"} ${name} (U+${hex})`;
}

function codePointOf(written: string): number {
  const lower = written.toLowerCase();
  const entity = ENTITIES.get(lower);
  if (entity !== undefined) return entity;
  const numeric = /^&#(x?)([0-9a-f]+);$|^\\u\{?([0-9a-f]+)\}?$/.exec(lower);
  if (!numeric) return written.codePointAt(0) ?? 0;
  const [, hex, digits, escaped] = numeric;
  return escaped ? Number.parseInt(escaped, 16) : Number.parseInt(digits ?? "", hex ? 16 : 10);
}

const dashOf = (written: string): Dash => ({ written, dash: dashName(codePointOf(written)) });

/** A text as a problem quotes it: whole when short, else the part around the dash at this index */
function excerptAround(text: string, index: number): string {
  if (text.length <= EXCERPT_CHARACTERS) return text;
  const start = Math.min(Math.max(0, index - EXCERPT_CHARACTERS / 2), text.length - EXCERPT_CHARACTERS);
  const end = start + EXCERPT_CHARACTERS;
  return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

/** Every dash in a text */
export function dashesIn(text: string): Dash[] {
  return Array.from(text.matchAll(DASH), ([written]) => dashOf(written));
}

/**
 * Every dash in a JSON document's string values, each with its key path, e.g. cars[2].description.en,
 * and the text around it
 */
export function dashesInJson(value: unknown, keyPath = ""): Array<Dash & { path: string; excerpt: string }> {
  if (typeof value === "string") {
    return Array.from(value.matchAll(DASH), (match) => ({
      ...dashOf(match[0]),
      path: keyPath,
      excerpt: excerptAround(value, match.index),
    }));
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => dashesInJson(item, `${keyPath}[${index}]`));
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => dashesInJson(item, keyPath ? `${keyPath}.${key}` : key));
  }
  return [];
}

/** Every dash in an MDX source, with its line and column from 1 */
export function dashesInMdx(source: string): Array<Dash & { line: number; column: number }> {
  return source.split("\n").flatMap((text, index) =>
    Array.from(text.matchAll(MDX_DASH), (match) => ({
      ...dashOf(match[0]),
      line: index + 1,
      column: match.index + 1,
    })),
  );
}

/**
 * The files pnpm check:dashes reads: the catalogs, seed data, seed credits and MDX of the project at
 * root, or, given paths, those files and the JSON and MDX files in those folders
 */
export function dashSources(root: string, paths: string[] = []): string[] {
  if (paths.length === 0) {
    return globSync(SOURCES, { cwd: root, exclude: (entry) => SKIP.has(entry) }).map((file) => path.join(root, file));
  }
  return paths.flatMap((entry) =>
    statSync(entry).isDirectory()
      ? globSync(["**/*.json", "**/*.mdx"], { cwd: entry }).map((file) => path.join(entry, file))
      : [entry],
  );
}
