"use client";

import { hasLocale } from "next-intl";
import { useEffect, useState } from "react";
import { describeError, reportRequested, round } from "@/app/_dev/harness";
import { postDevReport } from "@/app/_dev/report";
import { type AppLocale, routing } from "@/i18n/routing";
import { cn } from "@/lib/class-names";
import { C } from "./classes";
import { JOINED_AR } from "./copy";

// Spike T-11's measurements, once both fonts have loaded (DESIGN §3.3):
// - HEXP: each fixture's width at HEXP 0, 50 and 100. It applies to Arabic when, at both weights,
//   the Arabic sample widens by at least 5 % and by at least half as much as its Latin twin. These
//   thresholds were set before the first run;
// - tnum: under tabular-nums every digit has the same advance (within 0.01 px) at both sizes;
// - Martian Mono: tabular, and narrower at wdth 87.5 than at 100;
// - fallbacks: which fallback faces of font-fallbacks.css this device has, and whether each family
//   with an Arabic face draws Arabic (a local font can load without Arabic glyphs);
// - swap: each sample set again in its own fallback stack, which is what shows while the font
//   loads, to see how far the text would move when the font swaps in;
// - fit: whether a sample's widest line fits its column, since a word can't wrap.
// Query: report=1 sends the results to the Mac running the server (BUILD-PLAN §4).

type Families = { readex: string; martian: string };

type Results = {
  kind: "t11-type";
  page: string;
  loadedAt: string;
  environment: { userAgent: string; devicePixelRatio: number; viewport: { width: number; height: number } };
  families: Families;
  faces: { family: string; status: string; weight: string; stretch: string; unicodeRange: string }[];
  fontFiles: {
    url: string;
    initiator: string;
    transferSize: number;
    decodedBodySize: number;
    startMs: number;
    ms: number;
  }[];
  hexp: { script: AppLocale; wght: number; widths: Record<string, number>; gain: number }[];
  digits: { row: string; numeric: string; widths: number[]; spread: number }[];
  stretch: { wdth100: number; wdth875: number; ratio: number } | null;
  fallbacks: { family: string; loaded: number; failed: number; drawsArabic: boolean | null }[];
  swap: {
    sample: string;
    fallback: string;
    width: number;
    height: number;
    fallbackHeight: number;
    lines: number;
    fallbackLines: number;
  }[];
  fit: { sample: string; column: number; widestLine: number; over: number }[];
  pageOverflowX: boolean;
  arabicRules: { letterSpacing: string; fontStyle: string; textTransform: string } | null;
  verdict: { hexpArabic: boolean; tnum: boolean; martian: boolean };
  otherOrigins: string[];
  errors: string[];
};

/** The first family of a font-family list, the web font itself */
const first = (family: string) => family.split(",")[0]?.trim() ?? family;
/** The rest of the list: what the text shows while the web font loads */
const rest = (family: string) => family.split(",").slice(1).join(",").trim();

const width = (element: Element) => element.getBoundingClientRect().width;

function lineHeight(element: Element): number {
  const style = getComputedStyle(element);
  const value = style.lineHeight;
  if (value.endsWith("px")) return parseFloat(value);
  const factor = parseFloat(value);
  return (Number.isFinite(factor) ? factor : 1.2) * parseFloat(style.fontSize);
}

function measureHexp(): Results["hexp"] {
  const rows = new Map<string, { script: AppLocale; wght: number; widths: Record<string, number> }>();
  for (const element of document.querySelectorAll<HTMLElement>("[data-hexp]")) {
    const script = element.dataset.script;
    if (!hasLocale(routing.locales, script)) throw new Error(`A HEXP fixture names no script: ${script}`);
    const wght = Number(element.dataset.wght);
    const key = `${script}-${wght}`;
    const row = rows.get(key) ?? { script, wght, widths: {} };
    row.widths[element.dataset.hexp ?? ""] = round(width(element), 2);
    rows.set(key, row);
  }
  return [...rows.values()].map((row) => {
    const at0 = row.widths["0"] ?? 0;
    const at100 = row.widths["100"] ?? 0;
    return { ...row, gain: at0 > 0 ? round(at100 / at0 - 1, 4) : 0 };
  });
}

function measureDigits(): Results["digits"] {
  return [...document.querySelectorAll<HTMLElement>("[data-digits]")].map((row) => {
    const widths = [...row.querySelectorAll("[data-digit]")].map((digit) => round(width(digit), 3));
    return {
      row: row.dataset.digits ?? "",
      numeric: row.dataset.numeric ?? "",
      widths,
      spread: round(Math.max(...widths) - Math.min(...widths), 3),
    };
  });
}

function measureStretch(): Results["stretch"] {
  const at = (value: string) => document.querySelector(`[data-stretch="${value}"]`);
  const wide = at("100");
  const narrow = at("87.5");
  if (!wide || !narrow) return null;
  const wdth100 = round(width(wide), 2);
  const wdth875 = round(width(narrow), 2);
  return { wdth100, wdth875, ratio: round(wdth875 / wdth100, 4) };
}

/** Loads every fallback face, so the swap measurement finds each local font ready */
async function probeFallbacks(): Promise<Results["fallbacks"]> {
  const faces = [...document.fonts].filter((face) => face.family.includes("Fallback"));
  const loaded = await Promise.all(
    faces.map((face) =>
      face.load().then(
        () => true,
        () => false,
      ),
    ),
  );
  const families = new Map<string, Results["fallbacks"][number]>();
  faces.forEach((face, index) => {
    const family = face.family.replaceAll('"', "");
    const entry = families.get(family) ?? { family, loaded: 0, failed: 0, drawsArabic: null };
    if (loaded[index]) entry.loaded += 1;
    else entry.failed += 1;
    if (/U\+0?600/i.test(face.unicodeRange)) entry.drawsArabic = false;
    families.set(family, entry);
  });
  // Arabic in "family, monospace" against plain monospace: equal widths mean monospace drew it
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font-size:40px";
  probe.lang = "ar";
  probe.textContent = JOINED_AR;
  document.body.append(probe);
  probe.style.fontFamily = "monospace";
  const plain = width(probe);
  for (const entry of families.values()) {
    if (entry.drawsArabic === null || entry.loaded === 0) continue;
    probe.style.fontFamily = `"${entry.family}", monospace`;
    entry.drawsArabic = Math.abs(width(probe) - plain) > 0.5;
  }
  probe.remove();
  return [...families.values()];
}

/**
 * Sets each sample again, hidden, in the same slot, as it shows while its font loads, and compares
 * the heights. Each element takes the rest of its own font stack, the step's fallback faces. In the
 * figures, only the figures do: Readex Pro is preloaded and Martian Mono is not, so the labels are
 * already set.
 */
function measureSwap(): Results["swap"] {
  return [...document.querySelectorAll<HTMLElement>("[data-sample]")].map((sample) => {
    const slot = sample.closest<HTMLElement>("[data-slot]") ?? sample.parentElement;
    const figures = sample.hasAttribute("data-figures");
    const box = document.createElement("div");
    box.style.cssText = "position:absolute;inset-inline:0;inset-block-start:0;visibility:hidden;pointer-events:none";
    const clone = sample.cloneNode(true);
    if (!(clone instanceof HTMLElement)) throw new Error("A sample's copy is no element");
    clone.removeAttribute("data-sample");
    // The stacks are read from the sample, whose elements line up with the clone's
    const originals = [sample, ...sample.querySelectorAll<HTMLElement>("*")];
    const copies = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
    const fallback = rest(
      getComputedStyle(figures ? (sample.querySelector("[data-figure]") ?? sample) : sample).fontFamily,
    );
    originals.forEach((original, index) => {
      const copy = copies[index];
      if (copy && (!figures || original.hasAttribute("data-figure")))
        copy.style.fontFamily = rest(getComputedStyle(original).fontFamily);
    });
    box.append(clone);
    slot?.append(box);
    const rect = sample.getBoundingClientRect();
    const height = round(rect.height, 2);
    const fallbackHeight = round(clone.getBoundingClientRect().height, 2);
    const lines = Math.round(rect.height / lineHeight(sample));
    const fallbackLines = Math.round(clone.getBoundingClientRect().height / lineHeight(clone));
    box.remove();
    return {
      sample: sample.dataset.sample ?? "",
      fallback,
      width: round(rect.width, 2),
      height,
      fallbackHeight,
      lines,
      fallbackLines,
    };
  });
}

/** Each sample's widest line against its column: a single word wider than the column can't wrap */
function measureFit(): Results["fit"] {
  return [...document.querySelectorAll<HTMLElement>("[data-sample]")].map((sample) => {
    const range = document.createRange();
    range.selectNodeContents(sample);
    const widestLine = Math.max(0, ...[...range.getClientRects()].map((rect) => rect.width));
    const column = sample.clientWidth;
    return {
      sample: sample.dataset.sample ?? "",
      column,
      widestLine: round(widestLine, 1),
      over: round(Math.max(0, widestLine - column), 1),
    };
  });
}

export function TypeChecks({ locale, families }: { locale: AppLocale; families: Families }) {
  const [state, setState] = useState<"measuring" | "done" | "failed">("measuring");
  const [results, setResults] = useState<Results | null>(null);
  const [failure, setFailure] = useState("");
  const [sent, setSent] = useState("");

  useEffect(() => {
    let cancelled = false;
    const report = reportRequested(window.location.search);
    const errors: string[] = [];

    const run = async () => {
      await Promise.all([
        document.fonts.load(`600 40px ${first(families.readex)}`, "مفتاح Muftah"),
        document.fonts.load(`400 18px ${first(families.readex)}`, "شوف 0123456789"),
        document.fonts.load(`450 18px ${first(families.martian)}`, "0123456789"),
      ]).catch((error: unknown) => errors.push(`fonts.load: ${describeError(error)}`));
      await document.fonts.ready;

      const faces: Results["faces"] = [];
      document.fonts.forEach((face) => {
        faces.push({
          family: face.family,
          status: face.status,
          weight: face.weight,
          stretch: face.stretch,
          unicodeRange: face.unicodeRange.slice(0, 48),
        });
      });
      const resources = performance
        .getEntriesByType("resource")
        .filter((entry) => entry instanceof PerformanceResourceTiming);
      const fontFiles = resources
        .filter((entry) => entry.name.endsWith(".woff2"))
        .map((entry) => ({
          url: new URL(entry.name).pathname,
          initiator: entry.initiatorType,
          transferSize: entry.transferSize,
          decodedBodySize: entry.decodedBodySize,
          startMs: round(entry.startTime, 0),
          ms: round(entry.duration, 0),
        }));

      const fallbacks = await probeFallbacks();
      const hexp = measureHexp();
      const digits = measureDigits();
      const stretch = measureStretch();
      const display = document.querySelector<HTMLElement>('[data-sample="display"]');
      const arabicStyle = display?.closest('[lang="ar"]') ? getComputedStyle(display) : null;

      const gainOf = (script: AppLocale, wght: number) =>
        hexp.find((row) => row.script === script && row.wght === wght)?.gain ?? 0;
      const hexpArabic = [600, 400].every(
        (wght) => gainOf("ar", wght) >= 0.05 && gainOf("ar", wght) >= 0.5 * gainOf("en", wght),
      );
      const tabular = digits.filter((row) => row.numeric === "tabular-nums");
      const spreadOf = (row: string) => tabular.find((entry) => entry.row === row)?.spread ?? Infinity;

      const measured: Results = {
        kind: "t11-type",
        page: window.location.pathname + window.location.search,
        loadedAt: new Date().toISOString(),
        environment: {
          userAgent: navigator.userAgent,
          devicePixelRatio: window.devicePixelRatio,
          viewport: { width: window.innerWidth, height: window.innerHeight },
        },
        families,
        faces,
        fontFiles,
        hexp,
        digits,
        stretch,
        fallbacks,
        swap: measureSwap(),
        fit: measureFit(),
        pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        arabicRules: arabicStyle
          ? {
              letterSpacing: arabicStyle.letterSpacing,
              fontStyle: arabicStyle.fontStyle,
              textTransform: arabicStyle.textTransform,
            }
          : null,
        verdict: {
          hexpArabic,
          tnum: spreadOf("readex-body") <= 0.01 && spreadOf("readex-display") <= 0.01,
          martian: spreadOf("martian-875") <= 0.01 && (stretch?.ratio ?? 1) < 0.95,
        },
        otherOrigins: resources
          .map((entry) => entry.name)
          .filter((name) => new URL(name).origin !== window.location.origin),
        errors,
      };
      if (cancelled) return;
      setResults(measured);
      setState("done");

      if (!report) return;
      const { message } = await postDevReport(locale, measured);
      if (!cancelled) setSent(message);
    };

    run().catch((error: unknown) => {
      if (cancelled) return;
      setFailure(describeError(error));
      setState("failed");
    });
    return () => {
      cancelled = true;
    };
  }, [families, locale]);

  const verdict = (pass: boolean) => <td className={cn(C.cell, pass ? C.pass : C.fail)}>{pass ? "pass" : "fail"}</td>;
  const gain = (script: AppLocale, wght: number) => {
    const row = results?.hexp.find((entry) => entry.script === script && entry.wght === wght);
    return row ? `${row.gain >= 0 ? "+" : ""}${round(row.gain * 100, 1)} %` : "none";
  };
  const spread = (row: string, numeric: string) => {
    const entry = results?.digits.find((item) => item.row === row && item.numeric === numeric);
    return entry ? `${entry.spread} px` : "none";
  };

  return (
    <section className={C.results} aria-labelledby="results" data-state={state} lang="en" dir="ltr">
      <h2 id="results" className={C.sectionTitle}>
        Results
      </h2>
      {state === "measuring" ? <p>Measuring once both fonts have loaded.</p> : null}
      {state === "failed" ? <p role="alert">The checks failed: {failure}</p> : null}
      {results ? (
        <>
          <table className={C.table}>
            <thead>
              <tr>
                <th scope="col" className={C.headCell}>
                  Check
                </th>
                <th scope="col" className={C.headCell}>
                  Measured
                </th>
                <th scope="col" className={C.headCell}>
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={C.cell}>HEXP 0 to 100 widens Arabic, wght 600</td>
                <td className={C.cell}>
                  Arabic {gain("ar", 600)}, Latin {gain("en", 600)}
                </td>
                {verdict(results.verdict.hexpArabic)}
              </tr>
              <tr>
                <td className={C.cell}>HEXP 0 to 100 widens Arabic, wght 400</td>
                <td className={C.cell}>
                  Arabic {gain("ar", 400)}, Latin {gain("en", 400)}
                </td>
                {verdict(results.verdict.hexpArabic)}
              </tr>
              <tr>
                <td className={C.cell}>Readex Pro digits under tabular-nums</td>
                <td className={C.cell}>
                  spread {spread("readex-body", "tabular-nums")} at body, {spread("readex-display", "tabular-nums")} at
                  display; without it {spread("readex-body", "normal")}
                </td>
                {verdict(results.verdict.tnum)}
              </tr>
              <tr>
                <td className={C.cell}>Martian Mono tabular, narrower at wdth 87.5</td>
                <td className={C.cell}>
                  spread {spread("martian-875", "tabular-nums")}, width ratio {results.stretch?.ratio ?? "none"}
                </td>
                {verdict(results.verdict.martian)}
              </tr>
              {results.fit
                .filter((entry) => entry.over > 0)
                .map((entry) => (
                  <tr key={`fit-${entry.sample}`}>
                    <td className={C.cell}>Fit: {entry.sample}</td>
                    <td className={C.cell}>
                      widest line {entry.widestLine} px in a {entry.column} px column
                    </td>
                    <td className={cn(C.cell, C.fail)}>{`overflows by ${entry.over} px`}</td>
                  </tr>
                ))}
              <tr>
                <td className={C.cell}>Fallback faces on this device</td>
                <td className={C.cell}>
                  {results.fallbacks.filter((entry) => entry.loaded > 0).length} of {results.fallbacks.length} families
                  load; Arabic drawn by {results.fallbacks.filter((entry) => entry.drawsArabic).length}
                </td>
                <td className={C.cell}>listed below</td>
              </tr>
              {results.swap.map((entry) => (
                <tr key={entry.sample}>
                  <td className={C.cell}>Swap: {entry.sample}</td>
                  <td className={C.cell}>
                    {entry.fallbackLines} to {entry.lines} lines, {round(entry.height - entry.fallbackHeight, 1)} px
                  </td>
                  <td className={C.cell}>{entry.height === entry.fallbackHeight ? "no move" : "moves"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sent ? <p>{sent}</p> : null}
          <pre className={C.json} data-results>
            {JSON.stringify(results, null, 2)}
          </pre>
        </>
      ) : null}
    </section>
  );
}
