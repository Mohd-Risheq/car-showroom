// pnpm check:seed [folder] [--partial] (05-SEED-DATA §10): every check on the seed files, the
// ones scripts/seed.ts runs before it writes. Each problem names its file, its car or key path and
// the rule, and the check exits 1. --partial is for the batches written before every car is: a car
// of scripts/seed-expectations.json that seed/cars.json doesn't hold yet waits instead of failing,
// and the totals wait for the last batch, but the showcase's hero must be written, as the live
// settings refer to its row. The checks T-18 writes with the media are listed as pending, and what
// a run leaves unchecked, such as the VINs on a public clone, as skipped. Given a folder, it checks
// the seed files there instead of the project's, as its tests do.
import { parseArgs } from "node:util";
import { ROOT } from "./checks/files.ts";
import { seedChecks } from "./checks/seed-checks.ts";
import { readSeedFiles } from "./checks/seed-files.ts";

const { positionals, values } = parseArgs({ allowPositionals: true, options: { partial: { type: "boolean" } } });
const root = positionals[0] ?? ROOT;
const partial = values.partial ?? false;
const now = new Date();
const read = readSeedFiles(root, now);

if ("problems" in read) {
  for (const problem of read.problems) console.error(`check:seed: ${problem}`);
  process.exitCode = 1;
} else {
  const { cars, places, reference, expectations } = read.files;
  const { problems, pending, skipped } = seedChecks(read.files, now, { partial });
  for (const problem of problems) console.error(`check:seed: ${problem}`);
  for (const check of pending) console.log(`check:seed: pending (T-18): ${check}`);
  for (const reason of skipped) console.log(`check:seed: skipped: ${reason}`);
  if (problems.length > 0) {
    process.exitCode = 1;
  } else {
    const written = partial ? `${cars.length} of ${Object.keys(expectations.cars).length}` : `${cars.length}`;
    console.log(
      `check:seed: ${written} cars, ${places.length} places and ${reference.models.length} models pass (05-SEED-DATA §10)`,
    );
  }
}
