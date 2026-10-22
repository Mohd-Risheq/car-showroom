// scripts/check-versions.ts (SEC-11): fails when pnpm-lock.yaml installs next, react, react-dom or
// sharp below its security floor, naming the package, its version, the floor and the advisories
// behind it. pnpm audit:deps runs the same rule beside pnpm audit, OSV-Scanner and gitleaks. Given
// a path, it reads that lockfile instead, as TC-NFR-10's planted older next does.
//
// Usage: node scripts/check-versions.ts [pnpm-lock.yaml]
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, shown } from "./checks/files.ts";
import { floorReport, lockfilePackages } from "./checks/versions.ts";

const file = process.argv[2] ?? path.join(ROOT, "pnpm-lock.yaml");

function check(): { installed: string[]; problems: string[] } {
  if (!existsSync(file)) return { installed: [], problems: [`${shown(file)} is missing`] };
  const packages = lockfilePackages(readFileSync(file, "utf8"));
  if (typeof packages === "string") return { installed: [], problems: [`${shown(file)}: ${packages}`] };
  const { installed, problems } = floorReport(packages);
  return { installed, problems: problems.map((problem) => `${shown(file)}: ${problem}`) };
}

const { installed, problems } = check();
for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exitCode = 1;
else console.log(`check-versions: ${installed.join(", ")} meet SEC-11's floors`);
