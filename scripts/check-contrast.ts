// pnpm check:contrast (NFR-A11Y-01, DESIGN §3.1, §3.2 and §4.5): recomputes the WCAG 2 contrast
// ratio of every colour pair in scripts/contrast-pairs.json from the tokens in src/styles/tokens.css,
// across both workspace themes, the accent presets and the increased-contrast tokens. A pair fails
// below its minimum, or when it no longer has the ratio DESIGN states for it. Each problem names the
// tokens file, the scope, the two colours and the DESIGN reference, and the check exits 1. T-13
// writes both files; until then T-12 proves the check on tests/fixtures/checks/contrast.
//
// Usage: pnpm check:contrast [tokens.css] [--pairs pairs.json]
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { checkPairs, type PairList, type PairResult, parsePairs, tokenBlocks } from "./checks/contrast.ts";
import { readJson, ROOT, shown } from "./checks/files.ts";

const { positionals, values } = parseArgs({ allowPositionals: true, options: { pairs: { type: "string" } } });
const tokensFile = positionals[0] ?? path.join(ROOT, "src/styles/tokens.css");
const pairsFile = values.pairs ?? path.join(ROOT, "scripts/contrast-pairs.json");

/** The pair list, or the one problem that keeps it from being read */
function loadPairs(): PairList | string {
  const read = readJson(pairsFile);
  return "problem" in read ? read.problem : parsePairs(read.json, shown(pairsFile));
}

function check(): { problems: string[]; results: PairResult[] } {
  const missing = [tokensFile, pairsFile].filter((file) => !existsSync(file));
  if (missing.length > 0) return { problems: missing.map((file) => `${shown(file)} is missing`), results: [] };
  const list = loadPairs();
  if (typeof list === "string") return { problems: [list], results: [] };
  const { blocks, problems: unread } = tokenBlocks(readFileSync(tokensFile, "utf8"));
  const inTokens = (problem: string) => `${shown(tokensFile)}: ${problem}`;
  if (unread.length > 0) return { problems: unread.map(inTokens), results: [] };
  const { problems, results } = checkPairs(blocks, list);
  return { problems: problems.map(inTokens), results };
}

/** The lowest pair for each minimum, so a pass shows how close the tokens come */
function closest(results: PairResult[]): PairResult[] {
  const lowest = new Map<number, PairResult>();
  for (const result of results) {
    const current = lowest.get(result.pair.min);
    if (!current || result.ratio < current.ratio) lowest.set(result.pair.min, result);
  }
  return [...lowest.values()].sort((first, second) => first.pair.min - second.pair.min);
}

const { problems, results } = check();
for (const problem of problems) console.error(problem);
if (problems.length > 0) {
  process.exitCode = 1;
} else {
  const scopes = new Set(results.map(({ pair }) => pair.scope)).size;
  console.log(`check:contrast: ${results.length} pairs in ${scopes} scopes reach their minimums and DESIGN's ratios`);
  for (const { pair, ratio } of closest(results)) {
    console.log(`  closest to ${pair.min}:1: ${pair.scope} ${pair.fg} on ${pair.bg}, ${ratio.toFixed(2)}:1`);
  }
}
