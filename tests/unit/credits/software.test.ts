import { describe, expect, it } from "vitest";
import {
  creditedPins,
  licenceLink,
  type SoftwareRow,
  softwareListSchema,
  softwareProblems,
  sourceLink,
} from "@/features/credits/domain/software";

// The Software table's rows (DESIGN §7.2.9): where a row's licence and source link to, at its
// version, and every way the rows can fall behind package.json's dependencies, which stops the build
// (D-048).

const row = (fields: Partial<SoftwareRow> & Pick<SoftwareRow, "name">): SoftwareRow => ({
  licence: "mit",
  source: `https://github.com/example/${fields.name}`,
  licenceFile: "LICENSE",
  ...fields,
});

describe("creditedPins", () => {
  it("gives the dependencies' pins, and Tailwind CSS's among the devDependencies, as the site serves its styles", () => {
    const project = {
      dependencies: { clsx: "2.1.1", zod: "4.6.7" },
      devDependencies: { tailwindcss: "4.3.3", vitest: "5.0.5" },
    };
    expect(creditedPins(project)).toStrictEqual({ clsx: "2.1.1", zod: "4.6.7", tailwindcss: "4.3.3" });
    expect(creditedPins({ dependencies: { clsx: "2.1.1" } })).toStrictEqual({ clsx: "2.1.1" });
  });
});

describe("licenceLink", () => {
  it("links the licence file a package ships, at its version", () => {
    expect(licenceLink(row({ name: "clsx", licenceFile: "license" }), "2.1.1")).toBe(
      "https://cdn.jsdelivr.net/npm/clsx@2.1.1/license",
    );
    expect(licenceLink(row({ name: "@phosphor-icons/react" }), "2.1.10")).toBe(
      "https://cdn.jsdelivr.net/npm/@phosphor-icons/react@2.1.10/LICENSE",
    );
  });

  it("links a fixed address where the package ships no licence file, or the work is no package", () => {
    const gsap = row({
      name: "gsap",
      licence: "gsap-standard",
      licenceFile: undefined,
      licenceUrl: "https://gsap.com/standard-license",
    });
    expect(licenceLink(gsap, "3.15.0")).toBe("https://gsap.com/standard-license");
    const zxing = row({
      name: "zxing-cpp",
      licence: "apache-2.0",
      licenceFile: undefined,
      licenceUrl: "/wasm/zxing_reader.LICENSE.txt",
    });
    expect(licenceLink(zxing, undefined)).toBe("/wasm/zxing_reader.LICENSE.txt");
  });

  it("refuses a licence file without the version to read it at", () => {
    expect(() => licenceLink(row({ name: "aria-hidden" }), undefined)).toThrow(
      new RangeError("aria-hidden has no version, which its licence link needs"),
    );
  });
});

describe("sourceLink", () => {
  it("links an MPL-2.0 package's source at its version's tag, as MPL-2.0 §3.2(a) asks", () => {
    const mediabunny = row({
      name: "mediabunny",
      licence: "mpl-2.0",
      source: "https://github.com/Vanilagy/mediabunny",
    });
    expect(sourceLink(mediabunny, "1.61.5")).toBe("https://github.com/Vanilagy/mediabunny/tree/v1.61.5");
    expect(() => sourceLink(mediabunny, undefined)).toThrow(RangeError);
  });

  it("links any other row's source as it is", () => {
    expect(sourceLink(row({ name: "clsx", source: "https://github.com/lukeed/clsx" }), "2.1.1")).toBe(
      "https://github.com/lukeed/clsx",
    );
  });
});

describe("softwareListSchema", () => {
  const parsed = (rows: unknown) =>
    softwareListSchema.safeParse({ $comment: "Written by pnpm credits:software", rows });

  it("takes a row with a licence file or a fixed address, never both or neither", () => {
    expect(parsed([row({ name: "clsx" })]).success).toBe(true);
    expect(
      parsed([row({ name: "zxing-cpp", licenceFile: undefined, licenceUrl: "/wasm/zxing_reader.LICENSE.txt" })])
        .success,
    ).toBe(true);
    expect(parsed([row({ name: "clsx", licenceUrl: "https://opensource.org/license/mit" })]).success).toBe(false);
    expect(parsed([row({ name: "clsx", licenceFile: undefined })]).success).toBe(false);
  });

  it("refuses a licence the site doesn't allow, and a source that isn't an https address", () => {
    expect(parsed([row({ name: "x", licence: "gpl-3.0" as SoftwareRow["licence"] })]).success).toBe(false);
    expect(parsed([row({ name: "x", source: "git+https://github.com/example/x.git" })]).success).toBe(false);
    expect(parsed([row({ name: "x", licenceFile: undefined, licenceUrl: "wasm/x.txt" })]).success).toBe(false);
  });

  it("takes a licence file by a name packages give one, and no other file", () => {
    for (const licenceFile of ["LICENSE", "license.md", "LICENCE.txt", "COPYING"]) {
      expect(parsed([row({ name: "x", licenceFile })]).success, licenceFile).toBe(true);
    }
    for (const licenceFile of ["../LICENSE", "licenses.json", "LICENSE-THIRD-PARTY.txt"]) {
      expect(parsed([row({ name: "x", licenceFile })]).success, licenceFile).toBe(false);
    }
  });
});

describe("softwareProblems", () => {
  const dependencies = { clsx: "2.1.1", "radix-ui": "1.8.1" };
  const rows = [
    row({ name: "clsx" }),
    row({ name: "radix-ui" }),
    row({ name: "aria-hidden", within: "radix-ui", version: "1.2.6" }),
  ];

  it("finds none where each dependency has its row and each bundled work names what bundles it", () => {
    expect(softwareProblems(rows, dependencies)).toStrictEqual([]);
  });

  it("names a dependency without a row, and a row for a package that is no dependency", () => {
    expect(softwareProblems(rows, { ...dependencies, sonner: "2.0.8" })).toStrictEqual([
      "sonner is a dependency without a row in software.json: run pnpm credits:software",
    ]);
    expect(softwareProblems([...rows, row({ name: "lodash" })], dependencies)).toStrictEqual([
      "lodash has a row in software.json but is no dependency: run pnpm credits:software",
    ]);
  });

  it("names a bundled work whose bundling package has no row, and a row given twice", () => {
    expect(
      softwareProblems(
        [...rows, row({ name: "zxing-wasm", within: "barcode-detector", version: "3.1.3" })],
        dependencies,
      ),
    ).toStrictEqual(["zxing-wasm is bundled within barcode-detector, which has no row in software.json"]);
    expect(softwareProblems([...rows, row({ name: "clsx" })], dependencies)).toStrictEqual([
      "clsx has two rows in software.json",
    ]);
    expect(
      softwareProblems([...rows, row({ name: "aria-hidden", within: "radix-ui", version: "1.2.6" })], dependencies),
    ).toStrictEqual(["aria-hidden within radix-ui has two rows in software.json"]);
  });

  it("takes a package that is a dependency and bundled within another too, in a row as each", () => {
    const both = { ...dependencies, "aria-hidden": "1.2.6" };
    expect(softwareProblems([...rows, row({ name: "aria-hidden" })], both)).toStrictEqual([]);
    // The bundled row doesn't stand for the dependency's
    expect(softwareProblems(rows, both)).toStrictEqual([
      "aria-hidden is a dependency without a row in software.json: run pnpm credits:software",
    ]);
  });

  it("names a pin that isn't exact, and a dependency's row that carries a version of its own (D-010)", () => {
    expect(softwareProblems(rows, { ...dependencies, clsx: "^2.1.1" })).toStrictEqual([
      "clsx's pin, ^2.1.1, isn't an exact version (D-010)",
    ]);
    expect(softwareProblems([row({ name: "clsx", version: "2.1.0" }), ...rows.slice(1)], dependencies)).toStrictEqual([
      "clsx's row carries a version, where a dependency's comes from package.json",
    ]);
  });

  it("takes a prerelease's exact pin", () => {
    expect(softwareProblems(rows, { ...dependencies, clsx: "2.2.0-beta.1" })).toStrictEqual([]);
  });

  it("names a bundled package's row without the version its licence file or MPL-2.0 source links at", () => {
    const mpl = row({ name: "mpl-helper", within: "radix-ui", licence: "mpl-2.0" });
    expect(
      softwareProblems([...rows.slice(0, 2), row({ name: "aria-hidden", within: "radix-ui" }), mpl], dependencies),
    ).toStrictEqual([
      "aria-hidden within radix-ui has no version, which its licence link needs",
      "mpl-helper within radix-ui has no version, which its licence link needs",
      "mpl-helper within radix-ui has no version, which its source link needs",
    ]);
  });

  it("takes a bundled work linked to a fixed licence address without a version, as zxing-cpp and @radix-ui/* are", () => {
    const fixed = (name: string, licenceUrl: string) =>
      row({ name, within: "radix-ui", licenceFile: undefined, licenceUrl });
    const bundled = [
      fixed("zxing-cpp", "/wasm/zxing_reader.LICENSE.txt"),
      fixed("@radix-ui/*", "https://cdn.jsdelivr.net/npm/radix-ui@1.8.1/LICENSE"),
    ];
    expect(softwareProblems([...rows, ...bundled], dependencies)).toStrictEqual([]);
  });
});
