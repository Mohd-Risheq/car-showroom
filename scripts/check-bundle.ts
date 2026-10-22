// pnpm check:bundle: next build's client JavaScript against the budgets of NFR-PERF-03, kept in
// scripts/perf-budgets.json. It measures the files the build emitted, gzipped at level 9:
// - each route's first load: the chunks .next/diagnostics/route-bundle-stats.json lists;
// - each lazy budget: the chunks that import() of its trigger modules fetches, Web Workers
//   included, as the emitted code loads them. The emitted code names modules only by number, so
//   the bundle analyzer (next analyze, run here) says which module each import loads.
// What it measured goes to .next/diagnostics/bundle-budgets.json for pnpm metrics. It exits 1,
// with a line for each problem, when a budget is over or the two sources disagree. Method: D-037.
//
// Usage: pnpm build && pnpm check:bundle
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { gzipSync } from "node:zlib";
import {
  analyzerGroups,
  emittedImports,
  evaluate,
  type LazyGroup,
  lazyFiles,
  pairGroups,
  parseBudgets,
  parseRouteStats,
} from "./checks/bundle.ts";
import { readJson, ROOT } from "./checks/files.ts";
import { MAX_OUTPUT_BYTES } from "./checks/processes.ts";

const DIST_DIR = ".next";
const DIST = path.join(ROOT, DIST_DIR);
const STATS = path.join(DIST, "diagnostics/route-bundle-stats.json");
const BUDGETS = path.join(ROOT, "scripts/perf-budgets.json");
const OUT = path.join(DIST, "diagnostics/bundle-budgets.json");
const SNAPSHOT = "check-bundle";
const NEXT = createRequire(import.meta.url).resolve("next/dist/bin/next");

/** Runs the Next.js CLI and gives its output; its errors show as they come */
function next(args: string[]): string {
  const result = spawnSync(process.execPath, [NEXT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: MAX_OUTPUT_BYTES,
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (result.status === 0) return result.stdout;
  // Node's own error, such as ENOBUFS when the output passes the limit, says why it stopped
  const reason = result.error ? `: ${result.error.message}` : "";
  fail(`next ${args.join(" ")} failed (${result.status ?? result.signal})${reason}`);
}

/** A function of a file that computes each file's value once */
function cachedByFile<T extends object | string | number>(compute: (file: string) => T): (file: string) => T {
  const known = new Map<string, T>();
  return (file) => {
    const cached = known.get(file);
    if (cached !== undefined) return cached;
    const value = compute(file);
    known.set(file, value);
    return value;
  };
}

function fail(message: string): never {
  console.error(`check:bundle: ${message}`);
  process.exit(1);
}

const stats = readJson(STATS);
if ("problem" in stats) fail(`${stats.problem}: run pnpm build first`);
const budgetList = readJson(BUDGETS);
if ("problem" in budgetList) fail(budgetList.problem);
const routes = parseRouteStats(stats.json, DIST_DIR);
const budgets = parseBudgets(budgetList.json);

const bytes = cachedByFile((file) => readFileSync(path.join(DIST, file)));
const read = cachedByFile((file) => bytes(file).toString("utf8"));
const rawBytes = (file: string) => bytes(file).byteLength;
const gzipBytes = cachedByFile((file) => gzipSync(bytes(file), { level: 9 }).byteLength);

next(["analyze", "--output", "--snapshot", SNAPSHOT]);
const analyzed = analyzerGroups(next(["analyze", "export", "--snapshot", SNAPSHOT]));

const problems: string[] = [];
for (const route of analyzed.keys()) {
  if (!routes.some((entry) => entry.route === route)) {
    problems.push(`${route}: the bundle analyzer has lazy chunks here, but route-bundle-stats.json has no such route`);
  }
}
const groups: LazyGroup[] = [];
for (const { route, chunks } of routes) {
  const paired = pairGroups(route, analyzed.get(route) ?? [], emittedImports(chunks, read, rawBytes));
  problems.push(...paired.problems);
  for (const pair of paired.pairs) {
    groups.push({ route, module: pair.module, files: lazyFiles(pair.chunks, chunks, read) });
  }
}

const report = evaluate({ routes, groups, budgets, gzipBytes });
for (const line of report.lines) console.log(line);
writeFileSync(OUT, `${JSON.stringify(report.measured, null, 2)}\n`);
for (const problem of [...problems, ...report.problems]) console.error(problem);
if (problems.length > 0 || report.problems.length > 0) process.exitCode = 1;
