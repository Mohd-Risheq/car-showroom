import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import {
  capOf,
  displayBands,
  NARROWEST_RATIO,
  narrowRanges,
  parseModelNames,
  type Range,
  twoLinesFrom,
} from "../../scripts/checks/model-names.ts";
import type { AppLocale } from "../../src/lib/i18n/locales.ts";
import { tokenBlocks } from "../../src/styles/token-blocks.ts";
import { readTypeScale } from "../../src/styles/type-scale.ts";

// D-049's rule for a car title's model name (DESIGN §3.3), as the journeys hold a page to it: each
// catalog name's rule, from model-names.json as scripts/checks/model-names.ts reads it, the display
// step's bands and the room a title gives its name, from tokens.css, and a title read as the page
// sets it. model-names.spec.ts holds every catalog name to the rule in one car's title, and
// car-title.spec.ts each seed model in its own car's.

const TOKENS_CSS = readFileSync("src/styles/tokens.css", "utf8");
const SCALE = readTypeScale(TOKENS_CSS);
const { blocks: BLOCKS } = tokenBlocks(TOKENS_CSS);
const DISPLAY = SCALE.find(({ id }) => id === "display");
const LIST = parseModelNames(readFileSync("src/styles/model-names.json", "utf8"));

/** The display step's bands in a car title: the HEXP it takes from each ratio of column to size */
export const BANDS = displayBands(SCALE);

/** The share of its column, in percent, a car title's model name is set at most from 1024 px */
function roomShare(locale: AppLocale): number {
  const share = Number(BLOCKS.get(`[lang|="${locale}"]`)?.get("--display-room-share"));
  if (!(share > 0)) throw new Error(`tokens.css sets no --display-room-share for ${locale}`);
  return share;
}

/** Each language's room share, tokens.css's: Arabic's is larger, as its body is (D-049) */
export const ROOM_SHARE: Record<AppLocale, number> = { ar: roomShare("ar"), en: roomShare("en") };

/**
 * Within a pixel of a bound, a range's or a band's, a browser's rounding of the column decides the
 * HEXP, which isn't held there: WebKit measures a container in whole pixels, so it starts and ends
 * one up to a pixel late
 */
export const NEAR = 1;
/** How far a word may reach past the column, in px: no further than a browser's rounding of layout */
const REACH = 0.02;
/** The width from which the display step is at least four times the body's size (DESIGN §3.3) */
export const FOUR_TIMES_FROM = 768;
/**
 * The names set under four times the body's size from 768 px, where their cap applies (the
 * owner, 2026-11-10)
 */
export const SMALLER: Record<AppLocale, string[]> = { en: ["jeep-commander"], ar: [] };

/** The display step's HEXP on a screen so wide, by its media conditions (D-038) */
export function screenHexp(width: number): number {
  const hexps = (DISPLAY?.narrower ?? []).flatMap(({ at, hexp }) => {
    const rem = /^@media \(width < ([\d.]+)rem\)$/.exec(at)?.[1];
    return rem !== undefined && width < Number(rem) * 16 ? [hexp] : [];
  });
  return Math.min(DISPLAY?.hexp ?? Number.NaN, ...hexps);
}

/** The display step's HEXP in a car title whose column is at this ratio to its size: its band's */
export const bandHexp = (ratio: number) => BANDS.findLast(({ from }) => ratio >= from)?.hexp;

/** A catalog name's rule in a language: where it takes HEXP 0, its cap, where two lines hold it */
export function ruleFor(key: string, locale: AppLocale) {
  const model = LIST.models.find((candidate) => candidate.key === key);
  if (model === undefined) throw new Error(`${key} isn't in model-names.json`);
  const widths = model[locale];
  const narrowest = NARROWEST_RATIO[locale];
  return {
    key,
    name: widths.name,
    ranges: narrowRanges(widths, LIST.hexps, BANDS, narrowest),
    cap: capOf(widths, LIST.hexps, narrowest),
    twoLines: twoLinesFrom(widths, LIST.hexps),
  };
}
export type Rule = ReturnType<typeof ruleFor>;

/** Every catalog name's rule in a language */
export const rulesIn = (locale: AppLocale): Rule[] => LIST.models.map(({ key }) => ruleFor(key, locale));

type NameRead = {
  size: number;
  hexp: number;
  family: string;
  lines: number;
  /** How far apart its first two lines are, null for a name on one */
  pitch: number | null;
  leading: number;
  reach: number;
  broken: boolean;
};
type TitleRead = {
  column: number;
  usual: number;
  display: number;
  body: number;
  head: number;
  own: NameRead;
  step: NameRead;
};

/**
 * Reads the title's model name as the page sets it, then the same name with no model's rule (the
 * step's), then each name as its model's, each in a span of its own as the server renders a title,
 * and puts the page's span back. Firefox keeps a container rule's style on a span whose model changes
 * in place, which a page never does (D-049). A name's reach is how far its words go past the column,
 * in px, and the display step's size is the step's outside the title. With a width, the title is set
 * that wide first. page.evaluate sends it to the page as source text, so it uses nothing but its
 * argument and the page's own globals.
 */
function namesInTitle({ names, width }: { names: Array<{ key: string; name: string }>; width: number | null }) {
  const title = document.querySelector("h1");
  const wrapper = title?.querySelector(".model-name");
  const model = wrapper?.querySelector("[data-model]");
  if (!(title instanceof HTMLElement && wrapper instanceof HTMLElement && model instanceof HTMLElement))
    throw new Error("The title has no model name");
  title.style.width = width === null ? "" : `${width}px`;
  const column = wrapper.getBoundingClientRect();
  const sizeOf = (element: Element) => Number.parseFloat(getComputedStyle(element).fontSize);
  const stepSize = (step: string) => {
    const sample = document.body.appendChild(document.createElement("span"));
    sample.className = step;
    const size = sizeOf(sample);
    sample.remove();
    return size;
  };
  const measure = (element: HTMLElement) => {
    const name = element.textContent ?? "";
    const text = element.firstChild;
    if (text === null) throw new Error("The model name has no text");
    let reach = -Infinity;
    let broken = false;
    for (const match of name.matchAll(/\S+/g)) {
      const word = document.createRange();
      word.setStart(text, match.index ?? 0);
      word.setEnd(text, (match.index ?? 0) + match[0].length);
      const boxes = [...word.getClientRects()];
      if (new Set(boxes.map(({ top }) => Math.round(top))).size > 1) broken = true;
      for (const { left, right } of boxes) reach = Math.max(reach, column.left - left, right - column.right);
    }
    const whole = document.createRange();
    whole.selectNodeContents(element);
    // Each line's top, once however many boxes the line has
    const tops = [...new Map([...whole.getClientRects()].map(({ top }) => [Math.round(top), top])).values()].sort(
      (a, b) => a - b,
    );
    const [first, second] = tops;
    const style = getComputedStyle(element);
    return {
      size: Number.parseFloat(style.fontSize),
      hexp: Number(/"HEXP" ([\d.]+)/.exec(style.fontVariationSettings)?.[1]),
      family: style.fontFamily,
      lines: tops.length,
      pitch: first === undefined || second === undefined ? null : second - first,
      leading: Number.parseFloat(style.lineHeight),
      reach,
      broken,
    };
  };
  let shown = model;
  const read = (key: string, name: string) => {
    const span = model.cloneNode(false);
    if (!(span instanceof HTMLElement)) throw new Error("The model name didn't copy");
    span.dataset.model = key;
    span.textContent = name;
    shown.replaceWith(span);
    shown = span;
    return measure(span);
  };
  try {
    return {
      column: column.width,
      usual: sizeOf(wrapper),
      display: stepSize("type-display"),
      body: stepSize("type-body"),
      head: stepSize("type-head"),
      own: measure(model),
      // An empty model has no rule of its own
      step: read("", model.textContent ?? ""),
      names: names.map(({ key, name }) => read(key, name)),
    };
  } finally {
    if (shown !== model) shown.replaceWith(model);
    title.style.width = "";
  }
}

/** The title as namesInTitle reads it, with the names given set in it in turn */
export const readTitle = (page: Page, names: Rule[], width: number | null = null) =>
  page.evaluate(namesInTitle, { names: names.map(({ key, name }) => ({ key, name })), width });
export type NamesRead = Awaited<ReturnType<typeof readTitle>>;

/** Opens a car's page with Readex Pro loaded for every name the test sets in its title */
export async function openCar(page: Page, path: string, names: Rule[]) {
  await page.goto(path);
  await page.evaluate(
    async (text) => {
      const readex = getComputedStyle(document.documentElement).getPropertyValue("--font-readex-pro").split(",")[0];
      await document.fonts.load(`600 96px ${readex?.trim() ?? ""}`, text);
      await document.fonts.ready;
    },
    names.map(({ name }) => name).join(" "),
  );
}

/** Whether a ratio of column to size is in one of a name's ranges */
export const within = (ranges: Range[], ratio: number) => ranges.some(({ from, to }) => ratio >= from && ratio < to);

/** Holds a name as the page set it to the rule at the title's ratio of column to size */
export function expectByRule(read: NameRead, rule: Rule, title: TitleRead, at: string) {
  const ratio = title.column / title.usual;
  const label = `${rule.key} (${rule.name}) at ${at}, ratio ${ratio.toFixed(4)}`;
  expect(read.reach, label).toBeLessThanOrEqual(REACH);
  expect(read.broken, label).toBe(false);
  expect(read.lines, label).toBeLessThanOrEqual(ratio >= rule.twoLines ? 2 : 3);
  // Its lines the step's leading apart: it is a block, so its own line height sets them
  if (read.pitch !== null) expect(read.pitch, label).toBeCloseTo(read.leading, 0);
  const near = NEAR / title.usual;
  if (!rule.ranges.some(({ from, to }) => Math.abs(ratio - from) < near || Math.abs(ratio - to) < near)) {
    const hexp = within(rule.ranges, ratio) ? 0 : title.step.hexp;
    expect(read.hexp, label).toBe(hexp);
    // The faces that show while the web font loads are the ones measured at that HEXP
    expect(read.family, label).toContain(`Readex Pro Display ${hexp} Fallback`);
  }
  const capped = rule.cap === null ? Infinity : title.column / rule.cap;
  // Within half a pixel, as each browser rounds the column and the size its own way
  expect(read.size, label).toBeCloseTo(Math.min(title.usual, capped), 0);
  // The page's largest text all the same
  expect(read.size, label).toBeGreaterThan(title.head);
}
