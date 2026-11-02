// pnpm credits:software's rules (scripts/credits-software.ts): the Credits page's Software rows, read
// from the installed packages. Each runtime dependency in package.json gets a row with its licence and
// its source, as does Tailwind CSS, whose base styles every page's stylesheet holds (creditedPins),
// and the works bundled inside them that the decisions name follow the row that bundles
// them: zxing-wasm in barcode-detector and the zxing-cpp its reader is compiled from (D-010), and
// radix-ui's @radix-ui packages and its eight helpers (D-038). Other packages bundled inside the
// dependencies aren't listed, as the owner's answer asks (D-048). A licence the site doesn't allow, a
// licence with no text to link to, or a source that can't be linked is a problem naming its package,
// and the script then writes nothing.
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import {
  LICENCE_FILE,
  licenceLink,
  type SoftwareLicence,
  type SoftwareRow,
} from "../../src/features/credits/domain/software.ts";
import { isAddress, isRecord } from "../../src/lib/validation/seed.ts";
import { ROOT } from "./files.ts";

/** The rows pnpm credits:software writes, which the Credits page imports */
export const SOFTWARE_JSON = path.join(ROOT, "src/features/credits/software.json");

/** A package as installed: its folder, its package.json and the licence files it ships */
export type InstalledPackage = {
  name: string;
  version: string;
  dir: string;
  manifest: Readonly<Record<string, unknown>>;
  licenceFiles: readonly string[];
};

/** How the rows read what's installed, and a file the site serves */
export type Installed = {
  /** The project's dependency, as installed */
  dependency(name: string): InstalledPackage | undefined;
  /** A package's own dependency, as Node resolves it from that package */
  dependencyOf(parent: InstalledPackage, name: string): InstalledPackage | undefined;
  /** The text of a file in public/, by its path from the site's root */
  siteFile(sitePath: string): string | undefined;
};

/** The licence fields of package.json the site allows, by the code the table shows them under */
const LICENCES: ReadonlyMap<string, SoftwareLicence> = new Map([
  ["MIT", "mit"],
  ["ISC", "isc"],
  ["Apache-2.0", "apache-2.0"],
  ["MPL-2.0", "mpl-2.0"],
  // GSAP's two ways of naming its Standard licence, which SRS §11.2 records
  ["Standard 'no charge' license: https://gsap.com/standard-license.", "gsap-standard"],
  ["SEE LICENSE AT https://gsap.com/standard-license", "gsap-standard"],
]);

const GSAP_LICENCE = "https://gsap.com/standard-license";

/** Where the licence of a package that ships no licence file is, checked by hand at a version */
type LicencePage = { readonly version: string; readonly address: string };

/**
 * The licence pages of the packages that ship no licence file. An entry holds while its package is
 * installed at the version it was checked at, and the script stops when the version moves.
 */
const LICENCE_PAGES: ReadonlyMap<string, LicencePage> = new Map([
  // drizzle-orm's package leaves out the Apache licence its repository holds at each release's tag
  ["drizzle-orm", { version: "0.45.4", address: "https://github.com/drizzle-team/drizzle-orm/blob/0.45.4/LICENSE" }],
  // React's marker package, under MIT with no file and no repository of its own
  ["server-only", { version: "0.0.1", address: "https://opensource.org/license/mit" }],
  // One of radix-ui's helpers (D-038). 2.3.8 ships no licence file and has no tag, and its repository
  // had none until its author added the MIT licence in 2025, at the commit linked here (D-048).
  [
    "react-remove-scroll-bar",
    {
      version: "2.3.8",
      address:
        "https://github.com/theKashey/react-remove-scroll-bar/blob/7301c160fda44cb8cf2b9fdfde61efad35736196/LICENSE",
    },
  ],
]);

/** zxing-cpp's licence, as the site serves it beside the reader compiled from it (D-010) */
const ZXING_CPP_LICENCE = "/wasm/zxing_reader.LICENSE.txt";

/** radix-ui's helpers that D-038 names, each bundled inside its @radix-ui packages */
export const RADIX_HELPERS = [
  "aria-hidden",
  "react-remove-scroll",
  "react-remove-scroll-bar",
  "react-style-singleton",
  "use-callback-ref",
  "use-sidecar",
  "detect-node-es",
  "get-nonce",
] as const;

/** A package.json repository as an https address, from any of the forms npm takes, or undefined for none */
export function repositoryAddress(repository: unknown): string | undefined {
  const written = isRecord(repository) ? repository["url"] : repository;
  if (typeof written !== "string") return undefined;
  const shorthand = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(written);
  const address = shorthand
    ? `https://github.com/${shorthand[1]}`
    : written
        .replace(/^git\+/, "")
        .replace(/^(?:git|ssh):\/\/(?:git@)?/, "https://")
        .replace(/^git@([^:/]+):/, "https://$1/");
  return address.replace(/\/$/, "").replace(/\.git$/, "");
}

/** A package's row, or the problems that keep it from having one */
function packageRow(pkg: InstalledPackage, within?: string): { row: SoftwareRow } | { problems: string[] } {
  const problems: string[] = [];
  const written = pkg.manifest["license"];
  const licence = typeof written === "string" ? LICENCES.get(written) : undefined;
  if (licence === undefined) {
    problems.push(`${pkg.name}: its licence, ${JSON.stringify(written)}, isn't one the site allows (D-048)`);
  }
  const source = repositoryAddress(pkg.manifest["repository"]) ?? `https://www.npmjs.com/package/${pkg.name}`;
  if (!isAddress(source)) problems.push(`${pkg.name}: its repository, ${source}, isn't an https address`);
  if (licence === "mpl-2.0" && !source.startsWith("https://github.com/")) {
    problems.push(`${pkg.name}: an MPL-2.0 package's source must be on GitHub, at its version's tag`);
  }
  const [licenceFile] = pkg.licenceFiles;
  const page = LICENCE_PAGES.get(pkg.name);
  if (page !== undefined && licenceFile !== undefined) {
    problems.push(`${pkg.name} ships a licence file now: remove its LICENCE_PAGES entry`);
  } else if (page !== undefined && page.version !== pkg.version) {
    problems.push(`${pkg.name} is at ${pkg.version} now: check its licence at that version and update LICENCE_PAGES`);
  }
  const licenceUrl = licence === "gsap-standard" ? GSAP_LICENCE : page?.address;
  if (licenceFile === undefined && licenceUrl === undefined) {
    problems.push(`${pkg.name} ships no licence file: give LICENCE_PAGES its licence's address`);
  }
  if (licence === undefined || problems.length > 0) return { problems };
  return {
    row: {
      name: pkg.name,
      ...(within === undefined ? {} : { version: pkg.version, within }),
      licence,
      source,
      ...(licenceUrl === undefined ? { licenceFile } : { licenceUrl }),
    },
  };
}

/** Every package a package brings through its dependencies, its own aside, or the names not found */
function treeOf(root: InstalledPackage, installed: Installed): { packages: InstalledPackage[]; missing: string[] } {
  const seen = new Map<string, InstalledPackage>([[root.name, root]]);
  const missing: string[] = [];
  const queue = [root];
  for (let pkg = queue.shift(); pkg !== undefined; pkg = queue.shift()) {
    const dependencies = pkg.manifest["dependencies"];
    for (const name of isRecord(dependencies) ? Object.keys(dependencies) : []) {
      if (seen.has(name)) continue;
      const found = installed.dependencyOf(pkg, name);
      if (found === undefined) {
        missing.push(`${name}, a dependency of ${pkg.name}, isn't installed`);
        continue;
      }
      seen.set(name, found);
      queue.push(found);
    }
  }
  return { packages: [...seen.values()].slice(1), missing };
}

type Rows = { rows: SoftwareRow[]; problems: string[] };

const collect = (results: ReadonlyArray<{ row: SoftwareRow } | { problems: string[] }>): Rows => ({
  rows: results.flatMap((result) => ("row" in result ? [result.row] : [])),
  problems: results.flatMap((result) => ("problems" in result ? result.problems : [])),
});

/** barcode-detector's zxing-wasm, and the zxing-cpp its reader is compiled from, whose licence the site serves */
function zxingRows(barcodeDetector: InstalledPackage, installed: Installed): Rows {
  const wasm = installed.dependencyOf(barcodeDetector, "zxing-wasm");
  if (wasm === undefined)
    return { rows: [], problems: ["zxing-wasm, which barcode-detector bundles (D-010), isn't installed"] };
  const zxingWasm = collect([packageRow(wasm, barcodeDetector.name)]);
  const licence = installed.siteFile(ZXING_CPP_LICENCE);
  if (licence === undefined || !licence.includes("zxing-cpp") || !licence.includes("Apache License")) {
    return {
      rows: zxingWasm.rows,
      problems: [...zxingWasm.problems, `public${ZXING_CPP_LICENCE} doesn't give zxing-cpp's Apache License`],
    };
  }
  const zxingCpp: SoftwareRow = {
    name: "zxing-cpp",
    within: "zxing-wasm",
    licence: "apache-2.0",
    source: "https://github.com/zxing-cpp/zxing-cpp",
    licenceUrl: ZXING_CPP_LICENCE,
  };
  return { rows: [...zxingWasm.rows, zxingCpp], problems: zxingWasm.problems };
}

/**
 * The row of radix-ui's @radix-ui packages, which share its repository and licence. Each ships the
 * licence file radix-ui does, which the row links at radix-ui's version.
 */
function radixGroup(radix: InstalledPackage): { row: SoftwareRow } | { problems: string[] } {
  const [licenceFile] = radix.licenceFiles;
  if (licenceFile === undefined) {
    return { problems: [`${radix.name} ships no licence file for its @radix-ui packages' row`] };
  }
  const source = repositoryAddress(radix.manifest["repository"]) ?? `https://www.npmjs.com/package/${radix.name}`;
  return {
    row: {
      name: "@radix-ui/*",
      within: radix.name,
      licence: "mit",
      source,
      licenceUrl: licenceLink({ name: radix.name, licence: "mit", source, licenceFile }, radix.version),
    },
  };
}

/** radix-ui's @radix-ui packages, in one row, and its helpers (D-038) */
function radixRows(radix: InstalledPackage, installed: Installed): Rows {
  const { packages, missing } = treeOf(radix, installed);
  const own = packages.filter((pkg) => pkg.name.startsWith("@radix-ui/"));
  const notMit = own
    .filter((pkg) => pkg.manifest["license"] !== "MIT")
    .map((pkg) => `${pkg.name}: not under MIT, as radix-ui's row says`);
  const helpers = RADIX_HELPERS.map((name) => {
    const helper = packages.find((pkg) => pkg.name === name);
    return helper === undefined
      ? { problems: [`${name}, a helper D-038 names, isn't in radix-ui's packages`] }
      : packageRow(helper, radix.name);
  });
  const bundled = collect([radixGroup(radix), ...helpers]);
  return { rows: bundled.rows, problems: [...missing, ...notMit, ...bundled.problems] };
}

/** The works bundled inside a dependency, which follow its row, by the dependency's name */
const BUNDLED: ReadonlyMap<string, (pkg: InstalledPackage, installed: Installed) => Rows> = new Map([
  ["barcode-detector", zxingRows],
  ["radix-ui", radixRows],
]);

/** The Software rows for a project's runtime dependencies, in order by name, or the problems that stop them */
export function softwareRows(dependencies: readonly string[], installed: Installed): Rows {
  const results: Rows[] = dependencies.toSorted().map((name) => {
    const pkg = installed.dependency(name);
    if (pkg === undefined)
      return { rows: [], problems: [`${name} is a dependency that isn't installed: run pnpm install`] };
    const own = collect([packageRow(pkg)]);
    const bundled = BUNDLED.get(name)?.(pkg, installed) ?? { rows: [], problems: [] };
    return { rows: [...own.rows, ...bundled.rows], problems: [...own.problems, ...bundled.problems] };
  });
  return { rows: results.flatMap((result) => result.rows), problems: results.flatMap((result) => result.problems) };
}

/** A package installed at a folder, as the rows read it */
function packageAt(dir: string): InstalledPackage {
  const manifest = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as Record<string, unknown>;
  return {
    name: String(manifest["name"]),
    version: String(manifest["version"]),
    dir,
    manifest,
    licenceFiles: readdirSync(dir)
      .filter((file) => LICENCE_FILE.test(file))
      .toSorted(),
  };
}

/** The packages installed under a project's node_modules, found as Node finds them */
export function installedIn(root: string): Installed {
  /** The package's folder as Node resolves it from a folder: the nearest node_modules above that has it */
  const resolve = (name: string, from: string): string | undefined => {
    for (let dir = from; ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, "node_modules", name);
      if (existsSync(path.join(candidate, "package.json"))) return realpathSync(candidate);
      if (dir === path.dirname(dir)) return undefined;
    }
  };
  const at = (dir: string | undefined) => (dir === undefined ? undefined : packageAt(dir));
  return {
    dependency: (name) => at(resolve(name, root)),
    dependencyOf: (parent, name) => at(resolve(name, parent.dir)),
    siteFile: (sitePath) => {
      const file = path.join(root, "public", sitePath);
      return existsSync(file) ? readFileSync(file, "utf8") : undefined;
    },
  };
}

/** software.json's text, as pnpm credits:software writes it */
export function softwareJson(rows: readonly SoftwareRow[]): string {
  const list = {
    $comment:
      "The Credits page's Software rows (DESIGN §7.2.9), without the dependencies' versions, which the page reads from package.json. Written by pnpm credits:software.",
    rows,
  };
  return `${JSON.stringify(list, null, 2)}\n`;
}
