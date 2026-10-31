import { describe, expect, it } from "vitest";
import { lighthousePlan, lighthouseResults } from "../../../scripts/checks/lighthouse.ts";

// The pages pnpm lhci measures (NFR-PERF-02): the listed paths on the build's origin, with the pages
// not built yet named as pending, never measured

const ORIGIN = "http://localhost:3000";

describe("lighthousePlan", () => {
  it("measures each listed path on the origin, in order, and names the pages with none as pending", () => {
    const rc = {
      pages: [
        { name: "Home", paths: ["/ar", "/en"] },
        { name: "Inventory", paths: [] },
        { name: "Car page", paths: ["/en/cars/sample"] },
      ],
    };
    expect(lighthousePlan(rc, ORIGIN)).toStrictEqual({
      urls: [`${ORIGIN}/ar`, `${ORIGIN}/en`, `${ORIGIN}/en/cars/sample`],
      pending: ["Inventory"],
    });
  });

  it("measures nothing while every page is pending", () => {
    const rc = { pages: [{ name: "Home", paths: [] }] };
    expect(lighthousePlan(rc, ORIGIN)).toStrictEqual({ urls: [], pending: ["Home"] });
  });

  it("refuses a config without pages, or with a path that could leave the site", () => {
    const refusal = /^lighthouserc\.json has no list of pages pnpm lhci can read:\n/;
    expect(lighthousePlan({ ci: {} }, ORIGIN)).toMatch(refusal);
    expect(lighthousePlan({ pages: [] }, ORIGIN)).toMatch(refusal);
    expect(lighthousePlan({ pages: [{ name: "Home", paths: ["en"] }] }, ORIGIN)).toMatch(refusal);
    expect(lighthousePlan({ pages: [{ name: "Home", paths: ["//example.com/en"] }] }, ORIGIN)).toMatch(
      /starting with one \//,
    );
  });

  it("refuses a path the URL parser takes off the site, rather than measuring another site", () => {
    for (const offSite of ["/\\evil.example/en", "/\t/evil.example/en", "/\\["]) {
      expect(lighthousePlan({ pages: [{ name: "Home", paths: [offSite] }] }, ORIGIN)).toMatch(
        /a path that stays on this site/,
      );
    }
  });
});

// What pnpm lhci prints after the runs, and on GitHub Actions shows as annotations: each page's runs
// as Lighthouse CI's filesystem upload left them, or why there are none

const MANIFEST = ".lighthouseci/reports/manifest.json";

/** A run's report, with the fields pnpm lhci reads */
function runReport(fetchTime: string, score: number | null, metrics: Partial<Record<string, number>> = {}) {
  const { fcp = 910, lcp = 3000, tbt = 250, cls = 0, benchmarkIndex = 2800 } = metrics;
  return {
    fetchTime,
    categories: { performance: { score } },
    environment: { benchmarkIndex },
    audits: {
      "first-contentful-paint": { numericValue: fcp },
      "largest-contentful-paint": { numericValue: lcp },
      "total-blocking-time": { numericValue: tbt },
      "cumulative-layout-shift": { numericValue: cls },
    },
  };
}

/** A reader over the given files, as readJson answers for a missing one */
function files(contents: Record<string, unknown>) {
  return (file: string) => (file in contents ? { json: contents[file] } : { problem: `${file} is missing` });
}

describe("lighthouseResults", () => {
  const ar = `${ORIGIN}/ar`;
  const en = `${ORIGIN}/en`;

  it("gives each page's runs in the order they ran, with the median run the budget reads", () => {
    // Lighthouse CI lists the median run last; the runs ran 1, 2, 3
    const manifest = [
      { url: ar, isRepresentativeRun: false, jsonPath: "ar-1.json" },
      { url: ar, isRepresentativeRun: false, jsonPath: "ar-3.json" },
      { url: ar, isRepresentativeRun: true, jsonPath: "ar-2.json" },
    ];
    const read = files({
      [MANIFEST]: manifest,
      "ar-1.json": runReport("2026-10-31T19:13:07.000Z", 0.8, {
        lcp: 3369,
        tbt: 476.4,
        fcp: 910,
        benchmarkIndex: 2861.3,
      }),
      "ar-2.json": runReport("2026-10-31T19:13:18.000Z", 0.88, { lcp: 3237, tbt: 249, fcp: 908, benchmarkIndex: 2854 }),
      "ar-3.json": runReport("2026-10-31T19:13:29.000Z", 0.87, {
        lcp: 3258,
        tbt: 273,
        fcp: 907,
        cls: 0.0123,
        benchmarkIndex: 2846,
      }),
    });
    expect(lighthouseResults([ar], MANIFEST, read)).toStrictEqual([
      {
        url: ar,
        note:
          "performance 0.88 in the median run, by FCP and TTI, which the budget reads; runs 0.80, 0.88 (median), 0.87;" +
          " LCP 3.37, 3.24, 3.26 s; TBT 476, 249, 273 ms; FCP 0.91, 0.91, 0.91 s; CLS 0.000, 0.000, 0.012;" +
          " benchmarkIndex 2861, 2854, 2846",
      },
    ]);
  });

  it("shows a run Lighthouse couldn't score, or a metric it couldn't measure, as none", () => {
    const unscored = runReport("2026-10-31T19:13:07.000Z", null);
    unscored.audits["largest-contentful-paint"] = {} as { numericValue: number };
    const read = files({
      [MANIFEST]: [{ url: en, isRepresentativeRun: true, jsonPath: "en-1.json" }],
      "en-1.json": unscored,
    });
    const [result] = lighthouseResults([en], MANIFEST, read);
    expect(result).toStrictEqual({
      url: en,
      note:
        "performance none in the median run, by FCP and TTI, which the budget reads; runs none (median);" +
        " LCP none s; TBT 250 ms; FCP 0.91 s; CLS 0.000; benchmarkIndex 2800",
    });
  });

  it("names, for every page, the manifest it couldn't read, so a failed start doesn't read as a score", () => {
    expect(lighthouseResults([ar, en], MANIFEST, files({}))).toStrictEqual([
      { url: ar, problem: `no report, as ${MANIFEST} is missing` },
      { url: en, problem: `no report, as ${MANIFEST} is missing` },
    ]);
    const changed = lighthouseResults([ar], MANIFEST, files({ [MANIFEST]: { runs: [] } }));
    expect(changed).toStrictEqual([
      { url: ar, problem: expect.stringMatching(/^no report, as Lighthouse CI's manifest\.json no longer has/) },
    ]);
  });

  it("names the problem of a page with no run, no median run, or a run whose report it can't read", () => {
    const read = files({
      [MANIFEST]: [
        { url: en, isRepresentativeRun: false, jsonPath: "en-1.json" },
        { url: `${ORIGIN}/en/cars`, isRepresentativeRun: true, jsonPath: "cars-1.json" },
        { url: `${ORIGIN}/en/visit`, isRepresentativeRun: true, jsonPath: "visit-1.json" },
      ],
      "en-1.json": runReport("2026-10-31T19:13:07.000Z", 0.93),
      "visit-1.json": { fetchTime: "2026-10-31T19:13:07.000Z" },
    });
    const urls = [ar, en, `${ORIGIN}/en/cars`, `${ORIGIN}/en/visit`];
    const [noRun, noMedian, missing, changed] = lighthouseResults(urls, MANIFEST, read);
    expect(noRun).toStrictEqual({ url: ar, problem: "no run in Lighthouse CI's manifest.json" });
    expect(noMedian).toStrictEqual({ url: en, problem: "Lighthouse CI marked none of its runs as the median" });
    expect(missing).toStrictEqual({ url: `${ORIGIN}/en/cars`, problem: "cars-1.json is missing" });
    expect(changed).toStrictEqual({
      url: `${ORIGIN}/en/visit`,
      problem: expect.stringMatching(/^visit-1\.json no longer has the fields pnpm lhci reads:\n/),
    });
  });
});
