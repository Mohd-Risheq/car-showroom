import { httpsAddress } from "../../../lib/validation/seed.ts";
import { z } from "../../../lib/validation/zod.ts";

// The Credits page's Software table (DESIGN §7.2.9): a row for each package credited at its pin, and
// for each work bundled inside one that the decisions name (D-010, D-038). The packages credited at
// their pins are package.json's runtime dependencies and Tailwind CSS, whose base styles every
// page's stylesheet holds (creditedPins). The page reads their pins from package.json when the app
// is built, and its data module stops the build while the rows and package.json disagree (D-048).
// pnpm credits:software writes the rest to software.json from the installed packages: a bundled
// package's version, and each row's licence and source. So an update that moves one of those, as an
// update of radix-ui, of barcode-detector or the lock file's maintenance can, needs the list written
// again, which tests/unit/checks/software-credits.test.ts asks for. The scripts load this module
// under plain Node, so it imports other modules by their relative .ts paths.

/**
 * The devDependencies whose code the site serves, each credited at its pin as a dependency is:
 * Tailwind CSS, whose base styles every page's stylesheet holds (the owner, 2026-11-01)
 */
export const SERVED_DEV_DEPENDENCIES: readonly string[] = ["tailwindcss"];

type Manifest = {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
};

/**
 * The packages the table credits at their pins, by name: package.json's dependencies, and the
 * devDependencies the site serves
 */
export function creditedPins({ dependencies = {}, devDependencies = {} }: Manifest): Record<string, string> {
  const served = Object.entries(devDependencies).filter(([name]) => SERVED_DEV_DEPENDENCIES.includes(name));
  return { ...dependencies, ...Object.fromEntries(served) };
}

/** The licences the site's software may carry: pnpm credits:software stops on any other (D-048) */
export const SOFTWARE_LICENCES = ["mit", "isc", "apache-2.0", "mpl-2.0", "gsap-standard"] as const;
export type SoftwareLicence = (typeof SOFTWARE_LICENCES)[number];

// A file the site serves, by its path from the site's root, as zxing-cpp's licence in public/wasm
const sitePath = z.string().regex(/^\/[\w.-]+(?:\/[\w.-]+)*$/);

/** A licence file as packages name it: LICENSE, license.md, LICENCE.txt or COPYING */
export const LICENCE_FILE = /^(?:licen[cs]e|copying)(?:\.(?:md|txt))?$/i;

const softwareRowSchema = z
  .object({
    // The package's name, or a work's that is no package of its own (zxing-cpp)
    name: z.string().min(1).max(214),
    // A bundled package's version. A dependency's comes from package.json.
    version: z.string().min(1).optional(),
    // The row that bundles it
    within: z.string().min(1).optional(),
    licence: z.enum(SOFTWARE_LICENCES),
    // Its repository, or its npm page where it names none
    source: httpsAddress,
    // The licence file the package ships, linked at its version
    licenceFile: z.string().regex(LICENCE_FILE).optional(),
    // Where its licence is otherwise: a page, or a file the site serves
    licenceUrl: z.union([httpsAddress, sitePath]).optional(),
  })
  .refine((row) => (row.licenceFile === undefined) !== (row.licenceUrl === undefined), {
    error: "has a licence file or a licence address, one of the two",
  });

export type SoftwareRow = z.output<typeof softwareRowSchema>;

/** software.json: the rows in the table's order, each bundled work after the row that bundles it */
export const softwareListSchema = z.object({ $comment: z.string(), rows: z.array(softwareRowSchema) });

/** A version a row's link needs, or the error for the row that has none */
function needed(row: SoftwareRow, version: string | undefined, what: string): string {
  if (version === undefined) throw new RangeError(`${row.name} has no version, which its ${what} link needs`);
  return version;
}

/** Where a row's licence is: the file its package ships, at its version, or its fixed address */
export function licenceLink(row: SoftwareRow, version: string | undefined): string {
  if (row.licenceUrl !== undefined) return row.licenceUrl;
  return `https://cdn.jsdelivr.net/npm/${row.name}@${needed(row, version, "licence")}/${row.licenceFile}`;
}

/**
 * Where a row's source is. An MPL-2.0 package's is its repository at its version, as MPL-2.0 §3.2(a)
 * asks of a site that serves its code: pnpm credits:software takes such a package only from GitHub,
 * whose v-prefixed tags this links to (D-030).
 */
export function sourceLink(row: SoftwareRow, version: string | undefined): string {
  if (row.licence !== "mpl-2.0") return row.source;
  return `${row.source}/tree/v${needed(row, version, "source")}`;
}

/** A dependency's pin as package.json gives it: exact, as D-010's pins are */
const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Every way the rows and the dependencies creditedPins gives disagree: a dependency without a row, a
 * row for a package that is no dependency and isn't bundled by another row's, a row given twice, and
 * a pin that isn't exact; and a bundled package's row without the version its links need. The page's
 * data module stops the build on any (D-048).
 */
export function softwareProblems(
  rows: readonly SoftwareRow[],
  dependencies: Readonly<Record<string, string>>,
): string[] {
  const names = rows.map((row) => row.name);
  // A package may be a dependency and bundled within another too, in a row as each
  const labels = rows.map(({ name, within }) => (within === undefined ? name : `${name} within ${within}`));
  const problems: string[] = [];
  for (const label of new Set(labels.filter((label, index) => labels.indexOf(label) !== index))) {
    problems.push(`${label} has two rows in software.json`);
  }
  for (const [name, pin] of Object.entries(dependencies)) {
    if (!rows.some((row) => row.name === name && row.within === undefined)) {
      problems.push(`${name} is a dependency without a row in software.json: run pnpm credits:software`);
    }
    if (!EXACT.test(pin)) problems.push(`${name}'s pin, ${pin}, isn't an exact version (D-010)`);
  }
  for (const row of rows) {
    if (row.within === undefined && !Object.hasOwn(dependencies, row.name)) {
      problems.push(`${row.name} has a row in software.json but is no dependency: run pnpm credits:software`);
    }
    if (row.within === undefined && row.version !== undefined) {
      problems.push(`${row.name}'s row carries a version, where a dependency's comes from package.json`);
    }
    if (row.within !== undefined && !names.includes(row.within)) {
      problems.push(`${row.name} is bundled within ${row.within}, which has no row in software.json`);
    }
    // A bundled package's licence file and MPL-2.0 source link at the version its row gives, where
    // a fixed licence address needs none
    const unversioned = row.within !== undefined && row.version === undefined;
    if (unversioned && row.licenceFile !== undefined) {
      problems.push(`${row.name} within ${row.within} has no version, which its licence link needs`);
    }
    if (unversioned && row.licence === "mpl-2.0") {
      problems.push(`${row.name} within ${row.within} has no version, which its source link needs`);
    }
  }
  return problems;
}
