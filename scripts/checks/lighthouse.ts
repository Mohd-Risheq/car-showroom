// Which pages pnpm lhci (scripts/lhci.ts) measures: NFR-PERF-02's pages, as lighthouserc.json lists
// them. A page lists its paths once it is built and paints. Until then it is pending, because
// Lighthouse can't score a page that paints nothing (NO_FCP). After the runs, what each page's runs
// measured, as Lighthouse CI's filesystem upload left them, or why there is nothing to read.
import { stripVTControlCharacters } from "node:util";
import { z } from "zod";

/** The URLs to measure, and the pages with no paths yet */
export type LighthousePlan = { urls: string[]; pending: string[] };

/** lighthouserc.json's pages, whose paths must stay on the site at origin however URLs parse them */
function pagesSchema(origin: string) {
  const site = new URL(origin).origin;
  const pagePath = z
    .string()
    .regex(/^\/(?!\/)/, "a path on this site, starting with one /")
    .refine((text) => URL.parse(text, origin)?.origin === site, "a path that stays on this site");
  return z.object({
    pages: z.array(z.object({ name: z.string().min(1), paths: z.array(pagePath) })).min(1),
  });
}

/** The plan for a build served at origin, or why lighthouserc.json can't give one */
export function lighthousePlan(rc: unknown, origin: string): LighthousePlan | string {
  const parsed = pagesSchema(origin).safeParse(rc);
  if (!parsed.success) {
    return `lighthouserc.json has no list of pages pnpm lhci can read:\n${z.prettifyError(parsed.error)}`;
  }
  const { pages } = parsed.data;
  return {
    urls: pages.flatMap((page) => page.paths.map((pagePath) => new URL(pagePath, origin).href)),
    pending: pages.filter((page) => page.paths.length === 0).map((page) => page.name),
  };
}

/** What pnpm lhci says of a page's runs: the numbers, or why it has none */
export type PageResult = { url: string; note: string } | { url: string; problem: string };

/** Reads a JSON file, as readJson in ./files.ts does */
type Read = (file: string) => { json: unknown } | { problem: string };

const manifestSchema = z.array(z.object({ url: z.string(), isRepresentativeRun: z.boolean(), jsonPath: z.string() }));

// A metric Lighthouse couldn't measure has no value
const metric = z.object({ numericValue: z.number().optional() });
const reportSchema = z.object({
  fetchTime: z.string(),
  categories: z.object({ performance: z.object({ score: z.number().nullable() }) }),
  environment: z.object({ benchmarkIndex: z.number() }),
  audits: z.object({
    "first-contentful-paint": metric,
    "largest-contentful-paint": metric,
    "total-blocking-time": metric,
    "cumulative-layout-shift": metric,
  }),
});
type Run = z.infer<typeof reportSchema> & { median: boolean };

const unreadable = (file: string, error: z.ZodError) =>
  `${file} no longer has the fields pnpm lhci reads:\n${z.prettifyError(error)}`;

/** A value as the note shows it, or none where there is none */
const shownValue = (value: number | null | undefined, show: (value: number) => string) =>
  value === null || value === undefined ? "none" : show(value);

/**
 * One page's runs, in the order they ran: each run's score, the median run that the budget's
 * median-run reads (Lighthouse CI picks it by FCP and TTI, not by its score), each run's metrics,
 * and Lighthouse's benchmarkIndex for the speed of the CPU it ran on
 */
function note(runs: Run[], median: Run): string {
  const score = (run: Run) => shownValue(run.categories.performance.score, (value) => value.toFixed(2));
  const seconds = (ms: number) => (ms / 1000).toFixed(2);
  const each = (show: (run: Run) => string) => runs.map(show).join(", ");
  const audit = (id: keyof Run["audits"], show: (value: number) => string) =>
    each((run) => shownValue(run.audits[id].numericValue, show));
  return [
    `performance ${score(median)} in the median run, by FCP and TTI, which the budget reads`,
    `runs ${each((run) => `${score(run)}${run.median ? " (median)" : ""}`)}`,
    `LCP ${audit("largest-contentful-paint", seconds)} s`,
    `TBT ${audit("total-blocking-time", (ms) => ms.toFixed(0))} ms`,
    `FCP ${audit("first-contentful-paint", seconds)} s`,
    `CLS ${audit("cumulative-layout-shift", (value) => value.toFixed(3))}`,
    `benchmarkIndex ${each((run) => run.environment.benchmarkIndex.toFixed(0))}`,
  ].join("; ");
}

/** Each URL's runs, from Lighthouse CI's manifest.json and each report it lists */
export function lighthouseResults(urls: string[], manifestFile: string, read: Read): PageResult[] {
  const noReport = (why: string) => urls.map((url) => ({ url, problem: `no report, as ${why}` }));
  const manifest = read(manifestFile);
  if ("problem" in manifest) return noReport(manifest.problem);
  const parsed = manifestSchema.safeParse(manifest.json);
  if (!parsed.success) return noReport(unreadable("Lighthouse CI's manifest.json", parsed.error));
  return urls.map((url): PageResult => {
    const entries = parsed.data.filter((entry) => entry.url === url);
    if (!entries.length) return { url, problem: "no run in Lighthouse CI's manifest.json" };
    const runs: Run[] = [];
    for (const entry of entries) {
      const report = read(entry.jsonPath);
      if ("problem" in report) return { url, problem: report.problem };
      const run = reportSchema.safeParse(report.json);
      if (!run.success) return { url, problem: unreadable(entry.jsonPath, run.error) };
      runs.push({ ...run.data, median: entry.isRepresentativeRun });
    }
    const median = runs.find((run) => run.median);
    if (!median) return { url, problem: "Lighthouse CI marked none of its runs as the median" };
    runs.sort((a, b) => Date.parse(a.fetchTime) - Date.parse(b.fetchTime));
    return { url, note: note(runs, median) };
  });
}

/**
 * The last lines a command printed, without colour codes, blank lines or trailing spaces: for LHCI
 * or the build it measures, why a run stopped, which on GitHub Actions only the job's log holds
 */
export function lastLines(output: string, count: number): string {
  return stripVTControlCharacters(output)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-count)
    .join("\n");
}
