import { readSeedFiles, type SeedFiles } from "../../scripts/checks/seed-files.ts";
import type { SeedOptions, SeedReport } from "../../scripts/seed-loader.ts";

// The seed as the tests read and load it, as scripts/seed.ts does: a folder's seed files, read as
// of a day, and a load's report. A problem in the files, or a refusal to load them, stops the test
// with the words pnpm seed would print, instead of failing somewhere later.

/**
 * A load as the demo's deployment runs it: the dealer, its cars and its settings, every car whole,
 * and the live settings written only where they are missing
 */
export const DEMO: SeedOptions = { demo: true, partial: false, resetSettings: false };

/** The seed files in the folder, read as of the day */
export function seedFilesIn(root: string, now: Date): SeedFiles {
  const read = readSeedFiles(root, now);
  if ("problems" in read) throw new Error(read.problems.join("\n"));
  return read.files;
}

/** The report of a load that wrote */
export function loaded(report: SeedReport) {
  if ("refused" in report) throw new Error(`Refused:\n${report.refused.join("\n")}`);
  return report;
}
