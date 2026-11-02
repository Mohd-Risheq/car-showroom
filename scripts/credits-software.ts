// pnpm credits:software: writes src/features/credits/software.json, the Credits page's Software rows,
// from the packages package.json credits (creditedPins) and the installed packages
// (scripts/checks/software-credits.ts).
// Run it after a dependency is added or removed, and after an update that moves a bundled package's
// version or a row's licence or source, as an update of radix-ui, of barcode-detector or the lock
// file's maintenance can. Until it runs, tests/unit/checks/software-credits.test.ts fails, and the
// page's build stops on a dependency added or removed (D-048). It writes nothing while a package
// breaks the rules, and prints each problem.
//
// Usage: pnpm credits:software
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { creditedPins } from "../src/features/credits/domain/software.ts";
import { ROOT, shown } from "./checks/files.ts";
import { installedIn, SOFTWARE_JSON, softwareJson, softwareRows } from "./checks/software-credits.ts";

const manifest = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as Parameters<
  typeof creditedPins
>[0];
const { rows, problems } = softwareRows(Object.keys(creditedPins(manifest)), installedIn(ROOT));

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exitCode = 1;
} else {
  writeFileSync(SOFTWARE_JSON, softwareJson(rows));
  console.log(`credits:software: ${rows.length} rows in ${shown(SOFTWARE_JSON)}`);
}
