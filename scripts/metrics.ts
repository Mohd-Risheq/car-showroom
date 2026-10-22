// pnpm metrics (FR-46): writes build-metrics.json from the outputs of real runs only (BUILD-PLAN
// §6.2): the bundle sizes pnpm check:bundle measured, Lighthouse CI's representative runs, and the
// test counts of the Vitest and Playwright JSON reports in reports/. A missing report leaves its
// field out, so the page hides what wasn't measured (FR-46.2). A report that is there but can't be
// read stops the command before anything is written. No workflow runs it yet: T-69, which builds
// the page, decides how the file reaches the deployed site (D-037).
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readJson, ROOT } from "./checks/files.ts";
import { type BuildMetrics, bundleMetrics, lighthouseRuns, playwrightCounts, vitestCounts } from "./checks/metrics.ts";

const OUT = path.join(ROOT, "build-metrics.json");
const problems: string[] = [];

/** A report read by its reader, undefined when the report doesn't exist; problems are collected */
function measured<T>(file: string, read: (json: unknown) => T | string): T | undefined {
  const full = path.join(ROOT, file);
  if (!existsSync(full)) return undefined;
  const report = readJson(full);
  if ("problem" in report) {
    problems.push(report.problem);
    return undefined;
  }
  const result = read(report.json);
  if (typeof result !== "string") return result;
  problems.push(`${file}: ${result}`);
  return undefined;
}

const testRuns = {
  unit: measured("reports/vitest-unit.json", vitestCounts),
  integration: measured("reports/vitest-integration.json", vitestCounts),
  e2e: measured("reports/playwright.json", playwrightCounts),
};
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
const metrics: BuildMetrics = {
  writtenAt: new Date().toISOString(),
  commit: head.status === 0 ? head.stdout.trim() : undefined,
  bundle: measured(".next/diagnostics/bundle-budgets.json", bundleMetrics),
  lighthouse: measured(".lighthouseci/reports/manifest.json", lighthouseRuns),
  tests: Object.values(testRuns).some((counts) => counts !== undefined) ? testRuns : undefined,
};

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exitCode = 1;
} else {
  // JSON.stringify leaves out the fields whose source was missing
  writeFileSync(OUT, `${JSON.stringify(metrics, null, 2)}\n`);
  const { bundle, lighthouse, tests } = metrics;
  const sources = Object.entries({ bundle, lighthouse, tests }).flatMap(([field, value]) => (value ? [field] : []));
  console.log(`metrics: wrote build-metrics.json with ${sources.length > 0 ? sources.join(", ") : "no measurements"}`);
}
