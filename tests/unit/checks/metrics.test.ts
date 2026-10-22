import { describe, expect, it } from "vitest";
import { bundleMetrics, lighthouseRuns, playwrightCounts, vitestCounts } from "../../../scripts/checks/metrics.ts";

// The readers behind pnpm metrics (FR-46, BUILD-PLAN §6.2), each on a report shaped as its tool writes
// it: they keep what was measured, leave out what wasn't, and refuse a report they can't read

describe("bundleMetrics", () => {
  it("keeps the measured routes and lazy chunks, and leaves out budgets no feature loads yet", () => {
    const report = {
      firstLoad: [{ route: "/[locale]", gzipBytes: 135340, budgetBytes: 174080 }],
      lazy: [
        { name: "Body Scan", budgetBytes: 25600 },
        { name: "Spin", budgetBytes: 20480, gzipBytes: 7190, route: "/[locale]/dev/spin" },
      ],
    };
    expect(bundleMetrics(report)).toStrictEqual({
      firstLoad: [{ route: "/[locale]", gzipBytes: 135340, budgetBytes: 174080 }],
      lazy: [{ name: "Spin", route: "/[locale]/dev/spin", gzipBytes: 7190, budgetBytes: 20480 }],
    });
  });

  it("refuses a report without the fields it reads", () => {
    expect(bundleMetrics({ routes: [] })).toMatch(
      /^bundle-budgets\.json no longer has the fields pnpm metrics reads:\n/,
    );
  });
});

describe("lighthouseRuns", () => {
  const entry = (url: string, isRepresentativeRun: boolean, performance: number | null) => ({
    url,
    isRepresentativeRun,
    htmlPath: "report.html",
    jsonPath: "report.json",
    summary: { performance, accessibility: 1, "best-practices": 0.96, seo: 1, pwa: 0.3 },
  });

  it("keeps each page's representative run, by path, with the four scores the page shows", () => {
    const manifest = [
      entry("http://localhost:3000/en", false, 0.91),
      entry("http://localhost:3000/en", true, 0.94),
      entry("http://localhost:3000/ar", true, 0.93),
    ];
    expect(lighthouseRuns(manifest)).toStrictEqual([
      { path: "/en", performance: 0.94, accessibility: 1, bestPractices: 0.96, seo: 1 },
      { path: "/ar", performance: 0.93, accessibility: 1, bestPractices: 0.96, seo: 1 },
    ]);
  });

  it("leaves out a category Lighthouse couldn't score, rather than show it as 0", () => {
    expect(lighthouseRuns([entry("http://localhost:3000/en", true, null)])).toStrictEqual([
      { path: "/en", accessibility: 1, bestPractices: 0.96, seo: 1 },
    ]);
  });

  it("refuses a manifest without the fields it reads", () => {
    expect(lighthouseRuns([{ url: "/en" }])).toMatch(
      /^Lighthouse CI's manifest\.json no longer has the fields pnpm metrics reads:\n/,
    );
  });
});

describe("vitestCounts and playwrightCounts", () => {
  it("counts a Vitest run, with pending and todo tests as skipped", () => {
    const report = {
      numTotalTests: 120,
      numPassedTests: 115,
      numFailedTests: 1,
      numPendingTests: 3,
      numTodoTests: 1,
      success: false,
      testResults: [],
    };
    expect(vitestCounts(report)).toStrictEqual({ passed: 115, failed: 1, skipped: 4, total: 120 });
  });

  it("counts a Playwright run, with tests that passed only on a retry as flaky", () => {
    const report = {
      suites: [],
      errors: [],
      stats: {
        startTime: "2026-10-18T09:00:00.000Z",
        duration: 61000,
        expected: 40,
        unexpected: 2,
        flaky: 1,
        skipped: 3,
      },
    };
    expect(playwrightCounts(report)).toStrictEqual({ passed: 40, failed: 2, skipped: 3, flaky: 1, total: 46 });
  });

  it("refuses a report without the fields it reads", () => {
    expect(vitestCounts({ numTotalTests: 3 })).toMatch(
      /^The Vitest report no longer has the fields pnpm metrics reads:\n/,
    );
    expect(playwrightCounts({ stats: {} })).toMatch(
      /^The Playwright report no longer has the fields pnpm metrics reads:\n/,
    );
  });
});
