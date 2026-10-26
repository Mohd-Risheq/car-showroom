import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { carSlug, SLUG_MAX_LENGTH, slugify } from "@/features/dealer/domain/slug";
import { seededRandom } from "@/lib/seeded-random";

// BR-16: {year}-{make}-{model}-{trim?}-{ref}, lowercase ASCII, words joined by hyphens and
// transliterated from the English names. The database checks the same format (car_slug_format).

const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const char = (codePoint: number) => String.fromCodePoint(codePoint);

const landCruiser = {
  modelYear: 2019,
  makeNameEn: "Toyota",
  modelNameEn: "Land Cruiser",
  trim: "GXR",
  refCode: "MU-3HK8",
};

describe("a car's slug", () => {
  it("joins the year, make, model, trim and reference, as the spec's examples do", () => {
    expect(carSlug(landCruiser)).toBe("2019-toyota-land-cruiser-gxr-mu-3hk8");
    // 05-SEED-DATA §5.3: the "+" is dropped, and so is the point of ID.4
    expect(
      carSlug({
        modelYear: 2022,
        makeNameEn: "Volkswagen",
        modelNameEn: "ID.4",
        trim: "Crozz Pure+",
        refCode: "MU-8VWC",
      }),
    ).toBe("2022-volkswagen-id4-crozz-pure-mu-8vwc");
    // SRS API-01
    expect(
      carSlug({ modelYear: 2021, makeNameEn: "Toyota", modelNameEn: "Corolla", trim: "Hybrid", refCode: "MU-24Q7" }),
    ).toBe("2021-toyota-corolla-hybrid-mu-24q7");
  });

  it("leaves out a trim the car doesn't have", () => {
    expect(carSlug({ ...landCruiser, trim: null })).toBe("2019-toyota-land-cruiser-mu-3hk8");
  });

  it("API-10: gives a new draft its reference alone, and adds each part of its name once that part is set", () => {
    const draft = { modelYear: null, makeNameEn: null, modelNameEn: null, trim: null, refCode: "MU-3HK8" };
    expect(carSlug(draft)).toBe("mu-3hk8");
    expect(carSlug({ ...draft, modelYear: 2019 })).toBe("2019-mu-3hk8");
    expect(carSlug({ ...draft, makeNameEn: "Toyota", modelNameEn: "Land Cruiser" })).toBe(
      "toyota-land-cruiser-mu-3hk8",
    );
  });

  it("writes accented letters without their marks, and joins words with one hyphen", () => {
    expect(slugify(`Citro${char(0x00eb)}n`)).toBe("citroen");
    expect(slugify(`${char(0x0160)}koda`)).toBe("skoda");
    expect(slugify("Mercedes-Benz")).toBe("mercedes-benz");
    expect(slugify("C 300 4MATIC")).toBe("c-300-4matic");
    expect(slugify("  Sport / Luxury  ")).toBe("sport-luxury");
    expect(slugify(`GT ${char(0x2014)} Line`)).toBe("gt-line");
    expect(slugify("Hybrid_SE")).toBe("hybrid-se");
  });

  it("reads Arabic-Indic and Persian digits as the Western digits they are", () => {
    for (const zero of [0x0660, 0x06f0]) {
      const typed = "C 300 4MATIC".replace(/\d/g, (digit) => char(zero + Number(digit)));
      expect(slugify(typed)).toBe("c-300-4matic");
    }
  });

  it("drops what has no English spelling, such as a trim typed in Arabic", () => {
    const arabicTrim = [0x0641, 0x0644, 0x0020, 0x0643, 0x0627, 0x0645, 0x0644].map(char).join("");
    expect(slugify(arabicTrim)).toBe("");
    expect(carSlug({ ...landCruiser, trim: arabicTrim })).toBe("2019-toyota-land-cruiser-mu-3hk8");
    expect(carSlug({ ...landCruiser, trim: `GXR ${char(0x1f697)}` })).toBe("2019-toyota-land-cruiser-gxr-mu-3hk8");
  });

  it("fits the column's 160 characters, cutting the name at a word and keeping the reference", () => {
    const trim = Array.from({ length: 30 }, (_, index) => `word${index}`).join(" ");
    const full = `2019-toyota-land-cruiser-${slugify(trim)}`;
    const slug = carSlug({ ...landCruiser, trim });
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug.endsWith("-mu-3hk8")).toBe(true);
    const head = slug.slice(0, -"-mu-3hk8".length);
    expect(full.startsWith(`${head}-`)).toBe(true);
    // A word too long to fit is cut where the room ends
    const long = carSlug({ ...landCruiser, modelYear: null, makeNameEn: "x".repeat(200) });
    expect(long).toBe(`${"x".repeat(SLUG_MAX_LENGTH - "-mu-3hk8".length)}-mu-3hk8`);
    expect(SLUG_MAX_LENGTH).toBe(160);
  });

  it("refuses a reference that isn't a stored code", () => {
    expect(() => carSlug({ ...landCruiser, refCode: "mu-3hk8" })).toThrow(RangeError);
  });

  it("always matches the database's slug format, whatever was typed", () => {
    const random = seededRandom(16);
    const alphabet = [..."aZ7 -_.+/", char(0x00e9), char(0x0627), char(0x2013), char(0x1f697)];
    const pick = () => alphabet[Math.floor(random() * alphabet.length)] ?? "";
    // Up to 80 characters a part, so some cars need the length cap
    const typed = () => (random() < 0.2 ? null : Array.from({ length: Math.floor(random() * 80) }, pick).join(""));
    for (let round = 0; round < 500; round += 1) {
      const parts = {
        modelYear: random() < 0.2 ? null : 1990 + Math.floor(random() * 40),
        makeNameEn: typed(),
        modelNameEn: typed(),
        trim: typed(),
        refCode: "MU-3HK8",
      };
      const slug = carSlug(parts);
      expect(slug, JSON.stringify(parts)).toMatch(SLUG_FORMAT);
      expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
      expect(slug.endsWith("mu-3hk8")).toBe(true);
    }
  });
});

// The docs stay in the private repository, so these checks run where they are. A skipped describe
// still runs its body to collect its tests, so the docs are read inside each test.
const SEED = "docs/05-SEED-DATA.md";
const SRS = "docs/02-SRS.md";

/** The seed's 29 cars, each with the slug BR-16 makes from its record, and the docs they come from */
function seedCars() {
  const seed = readFileSync(SEED, "utf8");
  const srs = readFileSync(SRS, "utf8");

  // SRS §6.4 names the makes in English, each with its Arabic name in brackets
  const makeList = /\*\*Makes and models:\*\*[^:]*: (.*?)\. Models cover/.exec(srs)?.[1] ?? "";
  const makeNames = new Map(
    Array.from(makeList.matchAll(/(?:^|, |and )([A-Z][A-Za-z -]*?) \(/g), ([, name = ""]) => [slugify(name), name]),
  );
  // 05-SEED-DATA §5.3: | `model-key` | Name EN / AR | body | aliases |
  const modelNames = new Map(
    Array.from(seed.matchAll(/^\| `([a-z0-9-]+)` \| (.+?) \/ /gm), ([, key = "", name = ""]) => [key, name]),
  );
  // 05-SEED-DATA §5.4 and §5.5: a heading with the reference, then the identity line
  const cars = Array.from(
    seed.matchAll(
      /^#### (S\d\d) · (\S+) · .*\n(?:.*\n)*?- \*\*Identity:\*\* `([a-z0-9-]+)` · `([a-z0-9-]+)` · (.+?) · (\d{4}) ·/gm,
    ),
    ([, record = "", refCode = "", makeKey = "", modelKey = "", trim = "", year = ""]) => ({
      record,
      refCode,
      slug: carSlug({
        modelYear: Number(year),
        makeNameEn: makeNames.get(makeKey) ?? `missing make ${makeKey}`,
        modelNameEn: modelNames.get(modelKey) ?? `missing model ${modelKey}`,
        trim: trim === "no trim" ? null : trim,
        refCode,
      }),
    }),
  );
  return { seed, srs, makeNames, cars };
}

describe.skipIf(!existsSync(SEED) || !existsSync(SRS))("the seed's cars", () => {
  it("reads all 29 records, each make and model with its English name", () => {
    const { makeNames, cars } = seedCars();
    expect(cars.map(({ record }) => record)).toStrictEqual(
      Array.from({ length: 29 }, (_, index) => `S${String(index + 1).padStart(2, "0")}`),
    );
    expect(makeNames.size).toBe(24);
    for (const { record, slug } of cars) expect(slug, record).not.toContain("missing");
  });

  it("gives each a well-formed, unique slug", () => {
    const { cars } = seedCars();
    for (const { record, slug } of cars) {
      expect(slug, record).toMatch(SLUG_FORMAT);
      expect(slug.length, record).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    }
    expect(new Set(cars.map(({ slug }) => slug)).size).toBe(cars.length);
  });

  it("gives each car the slug the docs write for it", () => {
    const { seed, srs, cars } = seedCars();
    const written = new Set(
      [seed, srs].flatMap((text) => text.match(/\b\d{4}-[a-z0-9-]+-[a-z]{2}-[2-9a-hjkmnp-z]{4}\b/g) ?? []),
    );
    expect(written.size).toBeGreaterThanOrEqual(3);
    const byRef = new Map(cars.map(({ refCode, slug }) => [refCode.toLowerCase(), slug]));
    for (const slug of written) expect(byRef.get(slug.slice(-7)), slug).toBe(slug);
  });
});
