import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import {
  CHANGE_KEYS,
  type ChangeKey,
  type CreditsFiles,
  creditsTables,
  LICENCE_KEYS,
  type LicenceKey,
  readCredits,
  SITE_KEYS,
  type SiteKey,
  type SoundRow,
  shownAddress,
} from "@/features/credits/domain/credits";
import { SOFTWARE_LICENCES } from "@/features/credits/domain/software";
import { isolate } from "@/lib/i18n/bidi";
import {
  DATA_AND_FONT_LICENCES,
  PHOTO_CHANGES,
  PHOTO_SITES,
  SEED_LICENCES,
  SOUND_CHANGES,
  SOUND_SITES,
} from "@/lib/validation/seed";
import en from "../../../messages/en.json";

// SCR-14's Credits page (DESIGN §7.2.9): the files it is built from, every problem that stops the
// build (D-048), and each table's rows in each language. The manifest is T-18's synthetic one, of
// the three cars in the seed checks' fixture, and the software made up here.

const FIXTURES = "tests/fixtures/checks/seed";
const json = (file: string): unknown => JSON.parse(readFileSync(`${FIXTURES}/${file}`, "utf8"));
const MANIFEST = json("public/seed/credits.json") as { files: Record<string, unknown>[] };

const SOFTWARE = {
  $comment: "Written by pnpm credits:software",
  rows: [
    {
      name: "barcode-detector",
      licence: "mit",
      source: "https://github.com/Sec-ant/barcode-detector",
      licenceFile: "LICENSE",
    },
    {
      name: "zxing-wasm",
      version: "3.1.3",
      within: "barcode-detector",
      licence: "mit",
      source: "https://github.com/Sec-ant/zxing-wasm",
      licenceFile: "LICENSE",
    },
    {
      name: "zxing-cpp",
      within: "zxing-wasm",
      licence: "apache-2.0",
      source: "https://github.com/zxing-cpp/zxing-cpp",
      licenceUrl: "/wasm/zxing_reader.LICENSE.txt",
    },
    {
      name: "mediabunny",
      licence: "mpl-2.0",
      source: "https://github.com/Vanilagy/mediabunny",
      licenceFile: "LICENSE",
    },
  ],
};

const FILES: CreditsFiles = {
  credits: MANIFEST,
  cars: json("seed/cars.json"),
  reference: json("seed/reference.json"),
  software: SOFTWARE,
  dependencies: { "barcode-detector": "3.0.8", mediabunny: "1.61.5" },
};

/** The manifest with its one clip changed */
function withClip(fields: Record<string, unknown>) {
  return { ...MANIFEST, files: MANIFEST.files.map((file) => (file.kind === "sound" ? { ...file, ...fields } : file)) };
}

function credits(files: Partial<CreditsFiles> = {}) {
  const result = readCredits({ ...FILES, ...files });
  if (!result.ok) throw new Error(result.problems.join("\n"));
  return result.credits;
}

const problems = (files: Partial<CreditsFiles>) => {
  const result = readCredits({ ...FILES, ...files });
  return result.ok ? [] : result.problems;
};

describe("readCredits", () => {
  it("reads the manifest, the cars it names and the software", () => {
    expect(readCredits(FILES).ok).toBe(true);
  });

  it("names each file that breaks its schema, after the file's name", () => {
    const manifest = { ...MANIFEST, files: [{ ...MANIFEST.files[0], plate: "hidden" }] };
    expect(problems({ credits: manifest })).toStrictEqual([
      "public/seed/credits.json: files[0].plate: not a key of this file",
    ]);
    expect(problems({ cars: [{ seedKey: "s1" }] })).toStrictEqual([
      expect.stringMatching(/^seed\/cars\.json: \[0\]\.seedKey: /),
      expect.stringMatching(/^seed\/cars\.json: \[0\]\.car: /),
    ]);
    expect(problems({ reference: { makes: [] } })).toStrictEqual([
      expect.stringMatching(/^seed\/reference\.json: models: /),
    ]);
    expect(problems({ software: { rows: [] } })).toStrictEqual([
      expect.stringMatching(/^src\/features\/credits\/software\.json: \$comment: /),
    ]);
    expect(problems({ dependencies: { mediabunny: 1 } })).toStrictEqual([
      expect.stringMatching(/^package\.json's dependencies: mediabunny: /),
    ]);
  });

  it("names a file of a car the seed hasn't got, and a car whose model the reference lacks", () => {
    const cars = json("seed/cars.json") as { seedKey: string; car: Record<string, unknown> }[];
    expect(problems({ cars: cars.filter(({ seedKey }) => seedKey !== "s02") })).toStrictEqual([
      "public/seed/credits.json credits files of s02, which seed/cars.json has no car for",
    ]);
    const renamed = cars.map((car) => (car.seedKey === "s03" ? { ...car, car: { ...car.car, modelKey: "x" } } : car));
    expect(problems({ cars: renamed })).toStrictEqual([
      "seed/cars.json: s03's make or model isn't in seed/reference.json",
    ]);
  });

  it("names software rows that disagree with package.json, as softwareProblems does", () => {
    expect(problems({ dependencies: { "barcode-detector": "3.0.8" } })).toStrictEqual([
      "mediabunny has a row in software.json but is no dependency: run pnpm credits:software",
    ]);
  });
});

describe("creditsTables", () => {
  const en = creditsTables(credits(), "en");
  const ar = creditsTables(credits(), "ar");

  it("credits each photo in the manifest's order, naming its car by its title in the page's language", () => {
    expect(en.photos).toHaveLength(28);
    expect(en.photos[0]).toStrictEqual({
      car: `2019 Toyota Land Cruiser ${isolate("GXR")}`,
      site: "credits.site.commons",
      author: { text: "Example Photographer", href: "https://commons.wikimedia.org/wiki/User:Example_Photographer" },
      licence: { key: "credits.licence.ccBySa40", href: "https://creativecommons.org/licenses/by-sa/4.0/" },
      original: {
        text: "Example Land Cruiser 01",
        href: "https://commons.wikimedia.org/wiki/File:Example_Land_Cruiser_01.jpg",
      },
      changes: ["credits.change.resized", "credits.change.platesPixelated"],
    });
    expect(ar.photos[0]?.car).toBe(`2019 تويوتا لاند كروزر ${isolate("GXR")}`);
  });

  it("shows an original without a title by its address, and Pexels' CC0 as CC0", () => {
    const unsplash = en.photos.find(({ site }) => site === "credits.site.unsplash");
    expect(unsplash?.original).toStrictEqual({
      address: "unsplash.com/photos/example-model-3-front-three-quarter",
      href: "https://unsplash.com/photos/example-model-3-front-three-quarter",
    });
    expect(en.photos.find(({ site }) => site === "credits.site.pexels")?.licence.key).toBe("credits.licence.cc0");
  });

  it("leaves out an original the file has neither a title nor an address for", () => {
    const own = { source: "owner", licence: "owner", licenceUrl: null, authorUrl: null };
    const manifest = { ...MANIFEST, files: [{ ...MANIFEST.files[0], ...own, title: null, originalUrl: null }] };
    expect(creditsTables(credits({ credits: manifest }), "en").photos[0]).toMatchObject({
      site: "credits.site.owner",
      author: { text: "Example Photographer", href: null },
      licence: { key: "credits.licence.owner", href: null },
      original: null,
    });
    const titled = { ...MANIFEST, files: [{ ...MANIFEST.files[0], originalUrl: null }] };
    expect(creditsTables(credits({ credits: titled }), "en").photos[0]?.original).toStrictEqual({
      text: "Example Land Cruiser 01",
      href: null,
    });
  });

  it("gives a library clip's recording as another car's, and a clip of the car its date in the language", () => {
    expect(en.sounds).toHaveLength(1);
    expect(en.sounds[0]).toMatchObject({
      car: `2019 Toyota Land Cruiser ${isolate("GXR")}`,
      site: "credits.site.freesound",
      recording: { key: "sound.sameEngine" },
      changes: [
        "credits.change.trimmed",
        "credits.change.mixedToMono",
        "credits.change.resampled",
        "credits.change.normalized",
      ],
    } satisfies Partial<SoundRow>);
    const dated = credits({ credits: withClip({ audioSource: "this_car", recordedAt: "2026-10-12" }) });
    expect(creditsTables(dated, "en").sounds[0]?.recording).toStrictEqual({ text: "12 Oct 2026" });
    expect(creditsTables(dated, "ar").sounds[0]?.recording).toStrictEqual({ text: "12 تشرين الأول 2026" });
    const undated = credits({ credits: withClip({ audioSource: "this_car", recordedAt: null }) });
    expect(creditsTables(undated, "en").sounds[0]?.recording).toBeNull();
  });

  it("credits each data source and font with its licence and its address", () => {
    expect(en.data.map(({ name }) => name)).toHaveLength(5);
    expect(en.data[0]).toStrictEqual({
      name: "NHTSA vPIC",
      author: "National Highway Traffic Safety Administration",
      licence: { key: "credits.licence.publicDomain", href: "https://www.usa.gov/government-copyright" },
      link: { address: "vpic.nhtsa.dot.gov/api", href: "https://vpic.nhtsa.dot.gov/api/" },
    });
    expect(en.fonts.map(({ name, licence }) => [name, licence.key])).toStrictEqual([
      ["Readex Pro", "credits.licence.ofl"],
      ["Martian Mono", "credits.licence.ofl"],
    ]);
  });

  it("lists each dependency at its pin and each bundled package at its version, after what bundles it", () => {
    expect(en.software).toStrictEqual([
      {
        name: "barcode-detector",
        version: "3.0.8",
        within: null,
        licence: { key: "credits.licence.mit", href: "https://cdn.jsdelivr.net/npm/barcode-detector@3.0.8/LICENSE" },
        source: {
          address: "github.com/Sec-ant/barcode-detector",
          href: "https://github.com/Sec-ant/barcode-detector",
        },
      },
      {
        name: "zxing-wasm",
        version: "3.1.3",
        within: "barcode-detector",
        licence: { key: "credits.licence.mit", href: "https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.3/LICENSE" },
        source: { address: "github.com/Sec-ant/zxing-wasm", href: "https://github.com/Sec-ant/zxing-wasm" },
      },
      {
        name: "zxing-cpp",
        version: null,
        within: "zxing-wasm",
        licence: { key: "credits.licence.apache", href: "/wasm/zxing_reader.LICENSE.txt" },
        source: { address: "github.com/zxing-cpp/zxing-cpp", href: "https://github.com/zxing-cpp/zxing-cpp" },
      },
      {
        name: "mediabunny",
        version: "1.61.5",
        within: null,
        licence: { key: "credits.licence.mpl", href: "https://cdn.jsdelivr.net/npm/mediabunny@1.61.5/LICENSE" },
        source: {
          address: "github.com/Vanilagy/mediabunny/tree/v1.61.5",
          href: "https://github.com/Vanilagy/mediabunny/tree/v1.61.5",
        },
      },
    ]);
  });

  it("gives the same rows in both languages but for the cars' titles and the clips' dates", () => {
    const untitled = ({ photos, data, fonts, software }: typeof en) => ({
      photos: photos.map(({ site, author, licence, original, changes }) => ({
        site,
        author,
        licence,
        original,
        changes,
      })),
      data,
      fonts,
      software,
    });
    expect(untitled(ar)).toStrictEqual(untitled(en));
  });

  it("refuses files read without readCredits, which hold no title for a car", () => {
    const read = credits();
    expect(() => creditsTables({ ...read, titles: new Map() }, "en")).toThrow(RangeError);
  });
});

describe("the names of the files' codes", () => {
  const t = createTranslator({ locale: "en", messages: en });
  /** Each code's name on the English page */
  const namesOf = (keys: Readonly<Record<string, SiteKey | LicenceKey | ChangeKey>>) =>
    Object.fromEntries(Object.entries(keys).map(([code, key]) => [code, t(key)]));

  // As the copy deck names them (DESIGN §9.2), each code of the lists the files take
  const SITES = {
    commons: "Wikimedia Commons",
    unsplash: "Unsplash",
    pexels: "Pexels",
    ai: "Generated with AI",
    owner: "Made for this site",
    freesound: "Freesound",
  };
  const LICENCES = {
    "cc0-1.0": "CC0 1.0",
    "cc-by-2.0": "CC BY 2.0",
    "cc-by-2.5": "CC BY 2.5",
    "cc-by-3.0": "CC BY 3.0",
    "cc-by-4.0": "CC BY 4.0",
    "cc-by-sa-2.0": "CC BY-SA 2.0",
    "cc-by-sa-2.5": "CC BY-SA 2.5",
    "cc-by-sa-3.0": "CC BY-SA 3.0",
    "cc-by-sa-4.0": "CC BY-SA 4.0",
    unsplash: "Unsplash License",
    "pexels-cc0": "CC0 1.0",
    ai: "The AI tool's terms",
    owner: "All rights reserved",
    "public-domain": "Public domain",
    "odbl-1.0": "ODbL 1.0",
    "ofl-1.1": "SIL OFL 1.1",
    isc: "ISC",
    mit: "MIT",
    "apache-2.0": "Apache 2.0",
    "mpl-2.0": "MPL 2.0",
    "gsap-standard": "GSAP Standard License",
  };
  const CHANGES = {
    resized: "Resized",
    "plates pixelated": "Plates pixelated",
    "exposure normalized": "Exposure normalized",
    trimmed: "Trimmed",
    "mixed to mono": "Mixed to mono",
    resampled: "Resampled",
    normalized: "Volume normalized",
  };

  it.each([
    { codes: "sites", keys: SITE_KEYS, names: SITES, lists: [PHOTO_SITES, SOUND_SITES] },
    {
      codes: "licences",
      keys: LICENCE_KEYS,
      names: LICENCES,
      lists: [SEED_LICENCES, DATA_AND_FONT_LICENCES, SOFTWARE_LICENCES],
    },
    { codes: "changes", keys: CHANGE_KEYS, names: CHANGES, lists: [PHOTO_CHANGES, SOUND_CHANGES] },
  ])("name each of the $codes as the copy deck does, and fail on a code without a name", ({ keys, names, lists }) => {
    expect(Object.keys(names).toSorted()).toStrictEqual([...new Set<string>(lists.flat())].toSorted());
    expect(namesOf(keys)).toStrictEqual(names);
  });
});

describe("shownAddress", () => {
  it.each([
    ["https://vpic.nhtsa.dot.gov/api/", "vpic.nhtsa.dot.gov/api"],
    ["https://github.com/lukeed/clsx", "github.com/lukeed/clsx"],
    ["https://www.npmjs.com/package/server-only", "www.npmjs.com/package/server-only"],
    ["https://example.org/", "example.org"],
    [
      "https://commons.wikimedia.org/wiki/File:%C5%A0koda_Octavia.jpg",
      "commons.wikimedia.org/wiki/File:Škoda_Octavia.jpg",
    ],
    // An escape that isn't UTF-8 shows as written
    ["https://example.org/%C5", "example.org/%C5"],
  ])("shows %s as %s", (href, shown) => {
    expect(shownAddress(href)).toBe(shown);
  });
});
