import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { creditedPins } from "@/features/credits/domain/software";
import { ROOT } from "../../../scripts/checks/files.ts";
import {
  type Installed,
  type InstalledPackage,
  installedIn,
  RADIX_HELPERS,
  repositoryAddress,
  SOFTWARE_JSON,
  softwareJson,
  softwareRows,
} from "../../../scripts/checks/software-credits.ts";

// pnpm credits:software's rules (D-048): each runtime dependency's row, the works bundled inside
// them that the decisions name, and every package that breaks the rules, planted in packages made up
// here. Then the committed list against the installed packages, as the script would write it.

/** A made-up installed package, under MIT with a licence file and a GitHub repository unless told otherwise */
function pkg(name: string, manifest: Record<string, unknown> = {}, licenceFiles = ["LICENSE"]): InstalledPackage {
  return {
    name,
    version: "1.0.0",
    dir: `/made-up/${name}`,
    manifest: { name, version: "1.0.0", license: "MIT", repository: `https://github.com/example/${name}`, ...manifest },
    licenceFiles,
  };
}

/** Installed packages that resolve by name alone, as a flat node_modules would */
function installed(packages: InstalledPackage[], siteFiles: Record<string, string> = {}): Installed {
  const byName = new Map(packages.map((found) => [found.name, found]));
  return {
    dependency: (name) => byName.get(name),
    dependencyOf: (_parent, name) => byName.get(name),
    siteFile: (sitePath) => siteFiles[sitePath],
  };
}

const ZXING_LICENCE = { "/wasm/zxing_reader.LICENSE.txt": "zxing-cpp ... Apache License, Version 2.0" };

/**
 * A helper of radix-ui's, made up but for react-remove-scroll-bar, which ships no licence file, at the
 * version its LICENCE_PAGES entry was checked at
 */
const radixHelper = (name: string, manifest: Record<string, unknown> = {}) =>
  name === "react-remove-scroll-bar" ? { ...pkg(name, manifest, []), version: "2.3.8" } : pkg(name, manifest);

/** radix-ui, one @radix-ui package that brings the eight helpers, and the helpers */
const radixTree = (helper: (name: string) => InstalledPackage = (name) => radixHelper(name)) => [
  pkg("radix-ui", { dependencies: { "@radix-ui/react-dialog": "1.0.0" } }),
  pkg("@radix-ui/react-dialog", { dependencies: Object.fromEntries(RADIX_HELPERS.map((name) => [name, "1.0.0"])) }),
  ...RADIX_HELPERS.map(helper),
];
const zxingTree = [pkg("barcode-detector", { dependencies: { "zxing-wasm": "1.0.0" } }), pkg("zxing-wasm")];

describe("softwareRows", () => {
  it("gives each dependency a row in name order, with its licence's code, its source and its licence file", () => {
    const packages = [
      pkg("zod"),
      pkg("topojson-client", { license: "ISC" }, ["LICENSE.md"]),
      pkg("@vercel/blob", { license: "Apache-2.0", repository: "https://github.com/vercel/storage.git" }, [
        "license.md",
      ]),
      pkg("mediabunny", {
        license: "MPL-2.0",
        repository: { type: "git", url: "git+https://github.com/Vanilagy/mediabunny.git" },
      }),
      pkg("gsap", { license: "Standard 'no charge' license: https://gsap.com/standard-license." }, []),
      // At the version its LICENCE_PAGES entry was checked at
      { ...pkg("server-only", { repository: undefined }, []), version: "0.0.1" },
    ];
    const { rows, problems } = softwareRows(
      packages.map(({ name }) => name),
      installed(packages),
    );
    expect(problems).toStrictEqual([]);
    expect(rows).toStrictEqual([
      {
        name: "@vercel/blob",
        licence: "apache-2.0",
        source: "https://github.com/vercel/storage",
        licenceFile: "license.md",
      },
      {
        name: "gsap",
        licence: "gsap-standard",
        source: "https://github.com/example/gsap",
        licenceUrl: "https://gsap.com/standard-license",
      },
      {
        name: "mediabunny",
        licence: "mpl-2.0",
        source: "https://github.com/Vanilagy/mediabunny",
        licenceFile: "LICENSE",
      },
      {
        name: "server-only",
        licence: "mit",
        source: "https://www.npmjs.com/package/server-only",
        licenceUrl: "https://opensource.org/license/mit",
      },
      {
        name: "topojson-client",
        licence: "isc",
        source: "https://github.com/example/topojson-client",
        licenceFile: "LICENSE.md",
      },
      { name: "zod", licence: "mit", source: "https://github.com/example/zod", licenceFile: "LICENSE" },
    ]);
  });

  it("puts barcode-detector's zxing-wasm and the zxing-cpp its reader is compiled from after it (D-010)", () => {
    const { rows, problems } = softwareRows(["barcode-detector"], installed(zxingTree, ZXING_LICENCE));
    expect(problems).toStrictEqual([]);
    expect(rows.map(({ name, within, version }) => [name, within, version])).toStrictEqual([
      ["barcode-detector", undefined, undefined],
      ["zxing-wasm", "barcode-detector", "1.0.0"],
      ["zxing-cpp", "zxing-wasm", undefined],
    ]);
    expect(rows.at(-1)).toMatchObject({ licence: "apache-2.0", licenceUrl: "/wasm/zxing_reader.LICENSE.txt" });
  });

  it.each([
    { file: "isn't there", siteFiles: {} },
    { file: "gives another licence", siteFiles: { "/wasm/zxing_reader.LICENSE.txt": "zxing-cpp ... MIT License" } },
    { file: "is another work's", siteFiles: { "/wasm/zxing_reader.LICENSE.txt": "Apache License, Version 2.0" } },
  ])("leaves zxing-cpp out while the licence the site serves for it $file", ({ siteFiles }) => {
    const { rows, problems } = softwareRows(["barcode-detector"], installed(zxingTree, siteFiles));
    expect(problems).toStrictEqual(["public/wasm/zxing_reader.LICENSE.txt doesn't give zxing-cpp's Apache License"]);
    expect(rows.map(({ name }) => name)).toStrictEqual(["barcode-detector", "zxing-wasm"]);
  });

  it("names barcode-detector's zxing-wasm when it isn't installed", () => {
    expect(softwareRows(["barcode-detector"], installed(zxingTree.slice(0, 1), ZXING_LICENCE)).problems).toStrictEqual([
      "zxing-wasm, which barcode-detector bundles (D-010), isn't installed",
    ]);
  });

  it("puts radix-ui's @radix-ui packages in one row after it, then each helper D-038 names (D-038)", () => {
    const { rows, problems } = softwareRows(["radix-ui"], installed(radixTree()));
    expect(problems).toStrictEqual([]);
    expect(rows.map(({ name, within }) => [name, within])).toStrictEqual([
      ["radix-ui", undefined],
      ["@radix-ui/*", "radix-ui"],
      ...RADIX_HELPERS.map((name) => [name, "radix-ui"]),
    ]);
  });

  it("links the @radix-ui packages' row to radix-ui's licence file, at radix-ui's version", () => {
    expect(softwareRows(["radix-ui"], installed(radixTree())).rows[1]).toStrictEqual({
      name: "@radix-ui/*",
      within: "radix-ui",
      licence: "mit",
      source: "https://github.com/example/radix-ui",
      licenceUrl: "https://cdn.jsdelivr.net/npm/radix-ui@1.0.0/LICENSE",
    });
    const tree = radixTree();
    tree[0] = pkg("radix-ui", { dependencies: { "@radix-ui/react-dialog": "1.0.0" } }, []);
    expect(softwareRows(["radix-ui"], installed(tree)).problems).toStrictEqual([
      "radix-ui ships no licence file: give LICENCE_PAGES its licence's address",
      "radix-ui ships no licence file for its @radix-ui packages' row",
    ]);
  });

  it("names a @radix-ui package not under MIT, and a helper radix-ui no longer brings", () => {
    const tree = radixTree().filter(({ name }) => name !== "get-nonce");
    tree[1] = pkg("@radix-ui/react-dialog", { license: "Apache-2.0", dependencies: { "aria-hidden": "1.0.0" } });
    expect(softwareRows(["radix-ui"], installed(tree)).problems).toStrictEqual([
      "@radix-ui/react-dialog: not under MIT, as radix-ui's row says",
      "react-remove-scroll, a helper D-038 names, isn't in radix-ui's packages",
      "react-remove-scroll-bar, a helper D-038 names, isn't in radix-ui's packages",
      "react-style-singleton, a helper D-038 names, isn't in radix-ui's packages",
      "use-callback-ref, a helper D-038 names, isn't in radix-ui's packages",
      "use-sidecar, a helper D-038 names, isn't in radix-ui's packages",
      "detect-node-es, a helper D-038 names, isn't in radix-ui's packages",
      "get-nonce, a helper D-038 names, isn't in radix-ui's packages",
    ]);
  });

  it("names a package radix-ui brings that isn't installed", () => {
    const tree = radixTree((name) =>
      radixHelper(name, name === "use-sidecar" ? { dependencies: { tslib: "2.8.1" } } : {}),
    );
    expect(softwareRows(["radix-ui"], installed(tree)).problems).toStrictEqual([
      "tslib, a dependency of use-sidecar, isn't installed",
    ]);
  });

  it.each([
    ["GPL-3.0", '"GPL-3.0"'],
    ["(MIT OR CC0-1.0)", '"(MIT OR CC0-1.0)"'],
    ["toString", '"toString"'],
    [undefined, "undefined"],
  ])("refuses a package whose licence is %s", (license, shown) => {
    expect(softwareRows(["x"], installed([pkg("x", { license })])).problems).toStrictEqual([
      `x: its licence, ${shown}, isn't one the site allows (D-048)`,
    ]);
  });

  it("refuses a package whose repository isn't an https address", () => {
    expect(softwareRows(["x"], installed([pkg("x", { repository: "http://example.com/x" })])).problems).toStrictEqual([
      "x: its repository, http://example.com/x, isn't an https address",
    ]);
  });

  it("links a package's first licence file, of those installedIn lists in name order", () => {
    const [row] = softwareRows(["x"], installed([pkg("x", {}, ["LICENSE", "LICENSE.md"])])).rows;
    expect(row).toMatchObject({ licenceFile: "LICENSE" });
  });

  it("refuses a package with no licence file unless its licence's address is given by hand", () => {
    expect(softwareRows(["x"], installed([pkg("x", {}, [])])).problems).toStrictEqual([
      "x ships no licence file: give LICENCE_PAGES its licence's address",
    ]);
  });

  it("takes a licence page given by hand only at the version it was checked at, while no file ships", () => {
    const drizzle = (licenceFiles: string[]) => ({
      ...pkg("drizzle-orm", { license: "Apache-2.0" }, licenceFiles),
      version: "99.0.0",
    });
    expect(softwareRows(["drizzle-orm"], installed([drizzle([])])).problems).toStrictEqual([
      "drizzle-orm is at 99.0.0 now: check its licence at that version and update LICENCE_PAGES",
    ]);
    expect(softwareRows(["drizzle-orm"], installed([drizzle(["LICENSE"])])).problems).toStrictEqual([
      "drizzle-orm ships a licence file now: remove its LICENCE_PAGES entry",
    ]);
  });

  it("takes an MPL-2.0 package only from GitHub, whose tags its source link names", () => {
    const gitlab = pkg("x", { license: "MPL-2.0", repository: "https://gitlab.com/example/x" });
    expect(softwareRows(["x"], installed([gitlab])).problems).toStrictEqual([
      "x: an MPL-2.0 package's source must be on GitHub, at its version's tag",
    ]);
  });

  it("names a dependency that isn't installed", () => {
    expect(softwareRows(["x"], installed([])).problems).toStrictEqual([
      "x is a dependency that isn't installed: run pnpm install",
    ]);
  });
});

describe("repositoryAddress", () => {
  it.each([
    ["lukeed/clsx", "https://github.com/lukeed/clsx"],
    ["github:lukeed/clsx", "https://github.com/lukeed/clsx"],
    ["git+https://github.com/mui/base-ui.git", "https://github.com/mui/base-ui"],
    ["https://github.com/theKashey/use-callback-ref/", "https://github.com/theKashey/use-callback-ref"],
    ["git@github.com:theKashey/get-nonce.git", "https://github.com/theKashey/get-nonce"],
    ["git://github.com/example/x.git", "https://github.com/example/x"],
    ["git+ssh://git@github.com/example/x.git", "https://github.com/example/x"],
    [{ type: "git", url: "https://github.com/vercel/storage.git" }, "https://github.com/vercel/storage"],
    [undefined, undefined],
    [{ type: "git" }, undefined],
  ])("reads %j as %s", (repository, address) => {
    expect(repositoryAddress(repository)).toBe(address);
  });
});

describe("src/features/credits/software.json", () => {
  it("is what pnpm credits:software writes from the installed packages", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as Parameters<
      typeof creditedPins
    >[0];
    const { rows, problems } = softwareRows(Object.keys(creditedPins(manifest)), installedIn(ROOT));
    expect(problems).toStrictEqual([]);
    expect(readFileSync(SOFTWARE_JSON, "utf8")).toBe(softwareJson(rows));
  });
});
