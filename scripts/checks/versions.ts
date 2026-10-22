// SEC-11's version floor, read from pnpm-lock.yaml by scripts/check-versions.ts and pnpm audit:deps:
// every installed copy of next, react and react-dom, and of sharp when it is installed, is at or
// above its floor. Each later advisory raises a floor here (SRS §12, SEC-11).

/** A package's lowest allowed version, and the advisories that set it */
export type Floor = { name: string; min: string; advisories: string; optional?: true };

export const FLOORS: Floor[] = [
  { name: "next", min: "16.4.1", advisories: "GHSA-673q-mjm6-r5xr, GHSA-2464-fhr4-w9xw and GHSA-p3m5-59mp-jv5r" },
  { name: "react", min: "19.3.1", advisories: "GHSA-xqc2-xf4c-x3h3 and GHSA-h3gv-c5rc-p453" },
  { name: "react-dom", min: "19.3.1", advisories: "GHSA-xqc2-xf4c-x3h3 and GHSA-h3gv-c5rc-p453" },
  { name: "sharp", min: "0.35.5", advisories: "CVE-2026-96889 and GHSA-2464-fhr4-w9xw", optional: true },
];

// A package key in the lockfile's packages section, as "  next@16.4.2:" or "  '@img/sharp-darwin-arm64@0.35.5':"
const PACKAGE_KEY = /^ {2}'?((?:@[^/\s']+\/)?[^@\s']+)@([^('\s]+?)'?:/;

/** Every version of each package a pnpm lockfile (version 9) installs, or why it can't be read */
export function lockfilePackages(lockfile: string): Map<string, string[]> | string {
  const lines = lockfile.split("\n");
  if (!/^lockfileVersion: '9\.\d+'$/.test(lines[0] ?? ""))
    return "not a version 9 pnpm lockfile, the kind this check reads";
  const start = lines.indexOf("packages:");
  if (start === -1) return "has no packages section";
  const packages = new Map<string, string[]>();
  // The section runs to the next top-level key
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const [, name, version] = PACKAGE_KEY.exec(line) ?? [];
    if (name && version) packages.set(name, [...(packages.get(name) ?? []), version]);
  }
  return packages;
}

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Whether a version is at or above a floor release, or undefined when it isn't a version. A prerelease of the floor's own release is below it. */
export function meetsFloor(version: string, floor: string): boolean | undefined {
  const have = VERSION.exec(version);
  const need = VERSION.exec(floor);
  if (!have || !need) return undefined;
  for (const part of [1, 2, 3]) {
    const difference = Number(have[part]) - Number(need[part]);
    if (difference !== 0) return difference > 0;
  }
  return have[4] === undefined;
}

/** The lockfile's floor packages as "next 16.4.2", and every way they miss SEC-11's floors */
export function floorReport(
  packages: ReadonlyMap<string, string[]>,
  floors: Floor[] = FLOORS,
): { installed: string[]; problems: string[] } {
  const installed: string[] = [];
  const problems: string[] = [];
  for (const { name, min, advisories, optional } of floors) {
    const versions = packages.get(name) ?? [];
    if (versions.length === 0 && !optional) {
      problems.push(`${name} is not in the lockfile, so its SEC-11 floor of ${min} can't be checked`);
    }
    for (const version of versions) {
      installed.push(`${name} ${version}`);
      const meets = meetsFloor(version, min);
      if (meets === undefined) problems.push(`${name}@${version} is not a version this check can compare with ${min}`);
      else if (!meets) problems.push(`${name} ${version} is below its SEC-11 floor of ${min} (${advisories})`);
    }
  }
  return { installed, problems };
}
