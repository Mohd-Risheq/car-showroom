// What pnpm metrics (scripts/metrics.ts) reads into build-metrics.json for the "How it's built" page
// (FR-46, BUILD-PLAN §6.2): each reader takes one real report and keeps only what was measured, or
// says why the report can't be read. Nothing here estimates or fills in a number.
import { z } from "zod";
import { type Measured, measuredSchema } from "./bundle.ts";

/** A test run's counts, as its runner reported them */
export type TestCounts = { passed: number; failed: number; skipped: number; flaky?: number; total: number };
/** check:bundle's measurements, each lazy budget with the size and route it was measured on */
export type BundleMetrics = {
  firstLoad: Measured["firstLoad"];
  lazy: Array<{ name: string; route: string; gzipBytes: number; budgetBytes: number }>;
};
/** Lighthouse's category scores, 0 to 1, for one page's representative run */
export type LighthouseRun = {
  path: string;
  performance?: number;
  accessibility?: number;
  bestPractices?: number;
  seo?: number;
};
/** build-metrics.json: a field with no value is left out of the file (FR-46.2) */
export type BuildMetrics = {
  writtenAt: string;
  commit?: string | undefined;
  bundle?: BundleMetrics | undefined;
  lighthouse?: LighthouseRun[] | undefined;
  tests?: Partial<Record<"unit" | "integration" | "e2e", TestCounts | undefined>> | undefined;
};

const unreadable = (report: string, error: z.ZodError) =>
  `${report} no longer has the fields pnpm metrics reads:\n${z.prettifyError(error)}`;

/** check:bundle's measurements, with the lazy budgets no feature loads yet left out */
export function bundleMetrics(json: unknown): BundleMetrics | string {
  const parsed = measuredSchema.safeParse(json);
  if (!parsed.success) return unreadable("bundle-budgets.json", parsed.error);
  const lazy = parsed.data.lazy.flatMap(({ name, route, gzipBytes, budgetBytes }) =>
    route === undefined || gzipBytes === undefined ? [] : [{ name, route, gzipBytes, budgetBytes }],
  );
  return { firstLoad: parsed.data.firstLoad, lazy };
}

const manifestSchema = z.array(
  z.object({ url: z.url(), isRepresentativeRun: z.boolean(), summary: z.record(z.string(), z.number().nullable()) }),
);
const CATEGORIES = [
  ["performance", "performance"],
  ["accessibility", "accessibility"],
  ["best-practices", "bestPractices"],
  ["seo", "seo"],
] as const;

/** Lighthouse CI's representative run per page, from its filesystem upload's manifest.json */
export function lighthouseRuns(json: unknown): LighthouseRun[] | string {
  const parsed = manifestSchema.safeParse(json);
  if (!parsed.success) return unreadable("Lighthouse CI's manifest.json", parsed.error);
  return parsed.data
    .filter(({ isRepresentativeRun }) => isRepresentativeRun)
    .map(({ url, summary }) => {
      const run: LighthouseRun = { path: new URL(url).pathname };
      // A category Lighthouse couldn't score stays out rather than showing as 0
      for (const [category, field] of CATEGORIES) {
        const score = summary[category];
        if (typeof score === "number") run[field] = score;
      }
      return run;
    });
}

const vitestSchema = z.object({
  numTotalTests: z.number(),
  numPassedTests: z.number(),
  numFailedTests: z.number(),
  numPendingTests: z.number(),
  numTodoTests: z.number(),
});

/** A Vitest JSON report's counts */
export function vitestCounts(json: unknown): TestCounts | string {
  const parsed = vitestSchema.safeParse(json);
  if (!parsed.success) return unreadable("The Vitest report", parsed.error);
  const { numPassedTests, numFailedTests, numPendingTests, numTodoTests, numTotalTests } = parsed.data;
  return {
    passed: numPassedTests,
    failed: numFailedTests,
    skipped: numPendingTests + numTodoTests,
    total: numTotalTests,
  };
}

const playwrightSchema = z.object({
  stats: z.object({ expected: z.number(), unexpected: z.number(), flaky: z.number(), skipped: z.number() }),
});

/** A Playwright JSON report's counts: flaky tests passed only on a retry, so they count apart */
export function playwrightCounts(json: unknown): TestCounts | string {
  const parsed = playwrightSchema.safeParse(json);
  if (!parsed.success) return unreadable("The Playwright report", parsed.error);
  const { expected, unexpected, flaky, skipped } = parsed.data.stats;
  return { passed: expected, failed: unexpected, skipped, flaky, total: expected + unexpected + flaky + skipped };
}
