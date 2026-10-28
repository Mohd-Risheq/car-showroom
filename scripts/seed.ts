// node scripts/seed.ts [--partial] [--reset-settings] (05-SEED-DATA §9.2, SRS §6.4): loads the seed
// files into the database on DATABASE_URL_UNPOOLED, in one transaction. The reference data loads
// everywhere; the demo dealer, its cars and its settings only when DEMO_MODE=true and DEALER_SLUG
// is the demo dealer's. It writes nothing while pnpm check:seed finds a problem. --partial checks as
// pnpm check:seed --partial does, for the batches written before every car is; --reset-settings
// writes the dealer's live settings from seed/settings.json again (§2). It prints counts, never a
// URL or a row.
import nextEnv from "@next/env";
import { ROOT } from "./checks/files.ts";
import { readSeedFiles } from "./checks/seed-files.ts";
import { failureMessage, withScriptDatabase } from "./database.ts";
import { loadSeed, seedOptions } from "./seed-loader.ts";

nextEnv.loadEnvConfig(ROOT);

function refuse(problems: readonly string[]): void {
  for (const problem of problems) console.error(`seed: ${problem}`);
  console.error("seed: nothing written");
  process.exitCode = 1;
}

const now = new Date();
const read = readSeedFiles(ROOT, now);
const url = process.env.DATABASE_URL_UNPOOLED;

if ("problems" in read) {
  refuse(read.problems);
} else if (!url) {
  refuse(["DATABASE_URL_UNPOOLED isn't set (SRS §15.1)"]);
} else {
  const { slug } = read.files.settings.dealer;
  const options = seedOptions(process.env, process.argv, slug);
  try {
    const report = await withScriptDatabase(url, (database) => loadSeed(database, read.files, now, options));
    if ("refused" in report) {
      refuse(report.refused);
    } else {
      if (!options.demo)
        console.log(`seed: the reference data alone, as DEMO_MODE isn't true or DEALER_SLUG isn't ${slug}`);
      for (const [table, { inserted, updated, deleted, unchanged }] of Object.entries(report.counts)) {
        console.log(
          `seed: ${table}: ${inserted} inserted, ${updated} updated, ${deleted} deleted, ${unchanged} unchanged`,
        );
      }
      for (const note of report.notes) console.log(`seed: ${note}`);
    }
  } catch (error) {
    // The reason alone: never the failed query, its values or the URL
    console.error(`seed: ${failureMessage(error)}`);
    process.exitCode = 1;
  }
}
