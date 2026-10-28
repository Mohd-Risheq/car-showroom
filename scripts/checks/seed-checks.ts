// pnpm check:seed's checks (05-SEED-DATA §10), over the seed's files and the rows they give on one
// day in Amman. scripts/validate-seed.ts prints the report, and scripts/seed.ts writes nothing while
// it holds a problem. A problem names its file, the car or key path, and the rule it breaks. Cars
// are named by seed key and the rest by natural key, never by row id, since the loader may build the
// rows with the database's ids. The checks that read what T-18 adds, the media and the curation
// records, are listed as pending (D-045), and what a run can't check as skipped: the VINs on a
// public clone, and, in a partial run while the batches write the cars, whatever waits for a car not
// written yet. The showcase's hero never waits, as the live settings refer to its row. Pure, and it
// imports other modules by their relative .ts paths.
import { isRefCode } from "../../src/features/dealer/domain/ref-code.ts";
import { INSPECTION_ITEMS, inspectionFilled } from "../../src/features/inspection/domain/completeness.ts";
import { micronBand } from "../../src/features/inspection/domain/micron-band.ts";
import {
  isNewArrival,
  isPublic,
  type PriceChange,
  priceDrop,
  soldCutoff,
} from "../../src/features/inventory/domain/listing.ts";
import { missingPublicFields } from "../../src/features/inventory/domain/public-fields.ts";
import type { CarStatus, PanelId, RegionalSpecs } from "../../src/lib/db/enums.ts";
import { SEED_TIERS } from "../../src/lib/demo/seed-tiers.ts";
import { ammanDate } from "../../src/lib/format/calendar.ts";
import { normalizeSearch } from "../../src/lib/i18n/normalize.ts";
import type { SeedCar, SeedInspection, SeedPanel } from "../../src/lib/validation/seed.ts";
import type { MicronBands } from "../../src/lib/validation/settings.ts";
import { checkVin } from "../../src/lib/validation/vin.ts";
import { dashesIn } from "./dashes.ts";
import { SEED_PATHS, type SeedExpectations, type SeedFiles } from "./seed-files.ts";
import { appSchemaProblems, drawReading, type SeedCarRows, seedRows, type SeedRows } from "./seed-rows.ts";

/** What a run of the checks found */
export type SeedCheckReport = {
  /** Each a reason the seed doesn't load: its file, its car or key path, and the rule */
  readonly problems: readonly string[];
  /** The checks T-18 writes with what they read */
  readonly pending: readonly string[];
  /** What the run left unchecked, and why */
  readonly skipped: readonly string[];
};

/**
 * §10's checks, or their parts, that read what T-18 adds: the media, seed/assets.json and the
 * curation records. T-18 takes each off the list as it writes the check.
 */
export const PENDING_CHECKS = [
  "check 1: seed/assets.json's schema",
  "check 3: at least 6 photos with a cover, and the tier's shots",
  "check 6: left-hand drive, from the curation records",
  "check 9: the engine audio",
  "check 10: the assets, and the budgets of §3.6",
  "check 11: the colours, against the curation records",
  "check 12: the audio texts T-18 adds, in both languages, with no dash, Western digits only and D-007's form",
] as const;

const TIERS_PATH = "src/lib/demo/seed-tiers.ts";
// Every car that was ever published, and the cars §4.1 counts as public. The cards show a sold car
// too, until its window ends, so the badges follow isPublic instead.
const PUBLISHED_ONCE: ReadonlySet<CarStatus> = new Set(["published", "reserved", "sold"]);
const PUBLIC_STATUSES: ReadonlySet<CarStatus> = new Set(["published", "reserved"]);
// The bumpers: plastic, which a paint gauge can't read, unless marked steel (§5.2)
const BUMPERS: ReadonlySet<PanelId> = new Set(["front_bumper", "rear_bumper"]);
// What Jordan takes since its import rules changed: these standards, and a model year no more
// than 5 before the current one (A-11)
const NEW_RULE_SPECS: readonly RegionalSpecs[] = ["gcc", "american", "european"];
const NEW_RULE_MODEL_YEARS = 5;
// The histories A-11 refuses, which a problem names (§10 check 6)
const REFUSED_TITLES: ReadonlySet<string> = new Set(["salvage", "rebuilt"]);

// D-007: the Jordanian trade words a seed text writes only in brackets, after the formal word
// (§5.1). Each is found alone and with the affixes listed here, which Arabic joins to a word: a
// conjunction (and, so), then a preposition (with, like, for), then the article, and an ending, the
// plural or a pronoun (his, her, my, your). A word is matched whole, so باجيرو and نيوجيرسي pass. ان
// is no ending, as it would take جيران, while ي also takes جيري, lime's adjective, which no car's
// text needs.
const TRADE_WORDS = ["ماتور", "جير", "شاصي"];
const CONJUNCTIONS = ["", "و", "ف"];
const PREPOSITIONS = ["", "ب", "ك", "ل"];
// A preposition with the article: ب and ال make بال, but ل and ال make لل
const withArticle = (preposition: string) => (preposition === "ل" ? "لل" : `${preposition}ال`);
const PREFIXES = CONJUNCTIONS.flatMap((conjunction) =>
  PREPOSITIONS.flatMap((preposition) => [preposition, withArticle(preposition)]).map(
    (joined) => `${conjunction}${joined}`,
  ),
);
const ENDINGS = ["", "ات", "ه", "ها", "ي", "ك"];
const TRADE_FORMS: ReadonlySet<string> = new Set(
  TRADE_WORDS.flatMap((word) => PREFIXES.flatMap((prefix) => ENDINGS.map((ending) => `${prefix}${word}${ending}`))),
);
const BRACKETED = /\([^()]*\)/g;
// The marks and the tatweel, which sit inside a word without changing it
const INSIDE_WORDS = new RegExp(`\\p{M}|${String.fromCodePoint(0x0640)}`, "gu");
const WORD = /\p{L}+/gu;
// A digit other than 0 to 9, as the Arabic-Indic and Persian ones are
const FOREIGN_DIGIT = /(?![0-9])\p{Nd}/gu;

// §4.1's badges and note, as the cards and the car page show them (FR-06.7, BR-05)
const BADGES = [
  { badge: "new", name: "the New badge" },
  { badge: "priceReduced", name: "the Price reduced note" },
  { badge: "priceDropped", name: "the Price dropped badge" },
] as const satisfies ReadonlyArray<{ badge: keyof SeedExpectations["badges"]; name: string }>;

type CarExpected = SeedExpectations["cars"][string];

/** A record beside the rows it gives */
type SeedCarPair = { readonly record: SeedCar; readonly rows: SeedCarRows };

/** What every check reads */
type Context = {
  readonly files: SeedFiles;
  readonly rows: SeedRows;
  readonly cars: readonly SeedCarPair[];
  readonly now: Date;
  readonly partial: boolean;
  /** scripts/seed-expectations.json's cars that seed/cars.json doesn't hold, in its order */
  readonly unwritten: ReadonlySet<string>;
};

/** A check's problems, and what it left unchecked */
type Found = { readonly problems: readonly string[]; readonly skipped?: readonly string[] };

/** A value as a problem shows it */
const shown = (value: unknown) => (value === null || value === undefined ? "none" : String(value));
const listed = (seedKeys: readonly string[]) => (seedKeys.length === 0 ? "none" : seedKeys.join(", "));
/** A month as a record writes it, from the first day the rows store: 2018-12 */
const monthOf = (firstDay: string) => firstDay.slice(0, 7);
const inCars = (seedKey: string, detail: string) => `${SEED_PATHS.cars}: ${seedKey}: ${detail}`;

/** Whether a reference to the car waits for it: a partial run's, to a car not written yet */
const waitsFor = ({ partial, unwritten }: Context, seedKey: string) => partial && unwritten.has(seedKey);

/** The skipped line for what a check leaves to the cars that wait, or none when no car waits */
function waitingLine(context: Context, what: string, seedKeys: readonly string[]): string[] {
  const waiting = [...new Set(seedKeys)].filter((seedKey) => waitsFor(context, seedKey));
  return waiting.length === 0 ? [] : [`${what} ${listed(waiting)}, not written yet`];
}

/** The messages of the rules that fail */
const failing = (rules: ReadonlyArray<readonly [fails: boolean, message: string]>) =>
  rules.flatMap(([fails, message]) => (fails ? [message] : []));

/** Each item whose key an earlier item has, beside that earlier item, with both indexes */
function repeats<Item>(items: readonly Item[], keyOf: (item: Item) => string) {
  const firsts = new Map<string, { readonly item: Item; readonly index: number }>();
  return items.flatMap((item, index) => {
    const first = firsts.get(keyOf(item));
    if (first !== undefined) return [{ item, index, first }];
    firsts.set(keyOf(item), { item, index });
    return [];
  });
}

/** Every string in a value, with its key path: car.descriptionAr, journey[2].noteAr */
function textsIn(value: unknown, keyPath = ""): Array<{ readonly path: string; readonly text: string }> {
  if (typeof value === "string") return [{ path: keyPath, text: value }];
  if (Array.isArray(value)) return value.flatMap((item, index) => textsIn(item, `${keyPath}[${index}]`));
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => textsIn(item, keyPath ? `${keyPath}.${key}` : key));
  }
  return [];
}

/** How many of an inspection's 16 items have a known state (BR-07), or none without one */
function filledOf(inspection: SeedInspection | null): number | null {
  if (inspection === null) return null;
  const { chassis, engine, gearbox } = inspection.mechanical;
  return inspectionFilled([...inspection.panels.map(({ state }) => state), chassis.state, engine.state, gearbox.state]);
}

// Check 1

/** The aliases of a model as the table stores them: each folded, none empty and none twice (SRS §6.2) */
function aliasProblems(aliases: readonly string[]): string[] {
  const folded = aliases.map((alias) => normalizeSearch(alias));
  return [
    ...folded.flatMap((alias, index) => (alias === "" ? [`aliases[${index}]: folds to nothing`] : [])),
    ...repeats(folded, (alias) => alias).map(
      ({ item, index, first }) => `aliases[${index}]: folds to ${item}, as aliases[${first.index}] does`,
    ),
  ];
}

/** Check 1: the rows parse with the app's own schemas, and the keys the rows join on are unique and known */
function schemas({ files, rows, now }: Context): Found {
  const { reference } = files;
  const makes = new Set(reference.makes.map(({ key }) => key));
  const repeated = <Item>(
    file: string,
    items: readonly Item[],
    keyOf: (item: Item) => string,
    at: (index: number) => string,
  ) =>
    repeats(items, keyOf).map(
      ({ item, index, first }) => `${file}: ${at(index)}: ${keyOf(item)} repeats ${at(first.index)}`,
    );
  return {
    problems: [
      ...appSchemaProblems(rows, now),
      ...repeated(
        SEED_PATHS.cars,
        files.cars,
        ({ seedKey }) => seedKey,
        (index) => `[${index}].seedKey`,
      ),
      ...repeated(
        SEED_PATHS.reference,
        reference.makes,
        ({ key }) => key,
        (index) => `makes[${index}].key`,
      ),
      ...repeated(
        SEED_PATHS.reference,
        reference.models,
        ({ key }) => key,
        (index) => `models[${index}].key`,
      ),
      ...reference.models.flatMap(({ makeKey }, index) =>
        makes.has(makeKey) ? [] : [`${SEED_PATHS.reference}: models[${index}].makeKey: ${makeKey} isn't a make here`],
      ),
      ...reference.models.flatMap(({ aliases }, index) =>
        aliasProblems(aliases).map((detail) => `${SEED_PATHS.reference}: models[${index}].${detail}`),
      ),
      ...repeated(
        SEED_PATHS.places,
        files.places,
        ({ key }) => key,
        (index) => `[${index}].key`,
      ),
    ],
  };
}

// Check 2

/** The fields §4.1's table gives a car: each as the record holds it, then as the table does */
function listedFields({ status, seedOffsets, car }: SeedCar, expected: CarExpected) {
  return [
    ["status", status, expected.status],
    ["seedOffsets.published", seedOffsets.published ?? null, expected.published],
    ["seedOffsets.sold", seedOffsets.sold ?? null, expected.sold],
    ["car.mileageKm", car.mileageKm, expected.mileageKm],
    ["car.priceJod", car.priceJod, expected.priceJod],
    ["car.fuelType", car.fuelType, expected.fuelType],
    ["car.regionalSpecs", car.regionalSpecs, expected.regionalSpecs],
  ] as const;
}

/** A car as §4.1 lists it, and with a tier */
function listedProblems(record: SeedCar, expectations: SeedExpectations): string[] {
  const expected = expectations.cars[record.seedKey];
  const listing =
    expected === undefined
      ? [`not in ${SEED_PATHS.expectations}, which lists §4.1's cars`]
      : listedFields(record, expected).flatMap(([field, actual, wanted]) =>
          actual === wanted
            ? []
            : [`${field}: ${shown(actual)}, where ${SEED_PATHS.expectations} has ${shown(wanted)}`],
        );
  const tier = Object.hasOwn(SEED_TIERS, record.seedKey) ? [] : [`no tier in ${TIERS_PATH}`];
  return [...listing, ...tier].map((detail) => inCars(record.seedKey, detail));
}

/**
 * A car the expectations name in a badge, a contradiction or the import exception that their own
 * list of cars doesn't hold, which would otherwise drop out of its check unseen
 */
function unlistedCarProblems(expectations: SeedExpectations): string[] {
  const named = [
    ...BADGES.flatMap(({ badge }) =>
      expectations.badges[badge].map((seedKey, index) => [`badges.${badge}[${index}]`, seedKey] as const),
    ),
    ...expectations.contradictions.map(({ car }, index) => [`contradictions[${index}].car`, car] as const),
    ...(expectations.importException === null ? [] : [["importException", expectations.importException] as const]),
  ];
  return named.flatMap(([keyPath, seedKey]) =>
    Object.hasOwn(expectations.cars, seedKey)
      ? []
      : [`${SEED_PATHS.expectations}: ${keyPath}: ${seedKey} isn't one of its cars`],
  );
}

/** How many cars of each kind, beside §4.1's mix */
function mixProblems(kind: string, values: readonly (string | null)[], expected: Partial<Record<string, number>>) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(shown(value), (counts.get(shown(value)) ?? 0) + 1);
  return [...new Set([...Object.keys(expected), ...counts.keys()])].flatMap((type) => {
    const count = counts.get(type) ?? 0;
    const wanted = expected[type] ?? 0;
    return count === wanted
      ? []
      : [`${SEED_PATHS.cars}: the ${kind} mix has ${count} ${type}, where ${SEED_PATHS.expectations} has ${wanted}`];
  });
}

/** §4.1's totals over every car: the mix, and the public cars with a complete inspection (FR-04.4) */
function totalProblems({ files, cars }: Context): string[] {
  const { mix, publicWithCompleteInspection: wanted } = files.expectations;
  const complete = cars.filter(
    ({ record }) => PUBLIC_STATUSES.has(record.status) && filledOf(record.inspection) === INSPECTION_ITEMS,
  ).length;
  return [
    ...mixProblems(
      "fuel",
      cars.map(({ record }) => record.car.fuelType),
      mix.fuel,
    ),
    ...mixProblems(
      "body",
      cars.map(({ record }) => record.car.bodyType),
      mix.body,
    ),
    ...(complete === wanted
      ? []
      : [
          `${SEED_PATHS.cars}: the public cars with a complete inspection number ${complete}, where ${SEED_PATHS.expectations} has ${wanted}`,
        ]),
  ];
}

/** Check 2: each car as §4.1 lists it, and once every car is written, the totals */
function counts(context: Context): Found {
  const { files, cars, partial, unwritten } = context;
  const perCar = [
    ...cars.flatMap(({ record }) => listedProblems(record, files.expectations)),
    ...unlistedCarProblems(files.expectations),
  ];
  if (unwritten.size === 0) return { problems: [...perCar, ...totalProblems(context)] };
  if (partial) {
    return {
      problems: perCar,
      skipped: [`check 2: the totals, until every car is written (not yet: ${listed([...unwritten])})`],
    };
  }
  const missing = [...unwritten].map(
    (seedKey) => `${SEED_PATHS.expectations}: ${seedKey}: no record in ${SEED_PATHS.cars}`,
  );
  return { problems: [...perCar, ...missing] };
}

// Check 3

/**
 * Check 3, T-17's part: every car that was published has BR-29's fields, a description and its
 * plates confirmed. The file's schema holds BR-29's payment method.
 */
function publishRules({ cars }: Context): Found {
  return {
    problems: cars
      .filter(({ record }) => PUBLISHED_ONCE.has(record.status))
      .flatMap(({ record }) => {
        const { car } = record;
        return [
          ...missingPublicFields(car).map((field) => `car.${field}: none, where BR-29 needs one`),
          ...failing([
            [
              car.descriptionAr === null && car.descriptionEn === null,
              "car.descriptionAr, car.descriptionEn: none, where BR-29 needs a description",
            ],
            [!record.platesConfirmed, "platesConfirmed: false, where BR-29 needs the plates confirmed"],
          ]),
        ].map((detail) => inCars(record.seedKey, detail));
      }),
  };
}

// Check 4

/** A car's code (BR-15), and its make and model as the reference data has them */
function referenceProblems(record: SeedCar, files: SeedFiles): string[] {
  const { refCode, car } = record;
  const { refPrefix } = files.settings.dealer;
  const problems: string[] = [];
  if (!isRefCode(refCode)) problems.push(`refCode: ${refCode} isn't BR-15's form`);
  else if (!refCode.startsWith(`${refPrefix}-`)) problems.push(`refCode: ${refCode} doesn't start with ${refPrefix}-`);
  if (car.makeKey !== null && !files.reference.makes.some(({ key }) => key === car.makeKey)) {
    problems.push(`car.makeKey: ${car.makeKey} isn't a make in ${SEED_PATHS.reference}`);
  }
  if (car.modelKey !== null) {
    const model = files.reference.models.find(({ key }) => key === car.modelKey);
    if (model === undefined) problems.push(`car.modelKey: ${car.modelKey} isn't a model in ${SEED_PATHS.reference}`);
    else if (model.makeKey !== car.makeKey) {
      problems.push(`car.modelKey: ${car.modelKey} is a model of ${model.makeKey}, not ${shown(car.makeKey)}`);
    }
  }
  return problems.map((detail) => inCars(record.seedKey, detail));
}

/**
 * The hero is published, as the home page shows published cars only (FR-04.1), and so are the
 * featured cars (VR-28). In a partial run a featured car not written yet waits, but the hero never
 * does: the live settings' hero_car_id is a foreign key to the car's row, and featured_car_ids
 * has none.
 */
function showcaseProblems(context: Context): { problems: string[]; skipped: string[] } {
  const { heroCar, featuredCars } = context.files.settings.showcase;
  const statuses = new Map(context.cars.map(({ record }) => [record.seedKey, record.status]));
  const entries = [
    ...(heroCar === null ? [] : [{ path: "showcase.heroCar", seedKey: heroCar, rule: "FR-04.1", canWait: false }]),
    ...featuredCars.map((seedKey, index) => ({
      path: `showcase.featuredCars[${index}]`,
      seedKey,
      rule: "VR-28",
      canWait: true,
    })),
  ];
  const problems = entries.flatMap(({ path, seedKey, rule, canWait }) => {
    const status = statuses.get(seedKey);
    if (status === undefined) {
      return canWait && waitsFor(context, seedKey) ? [] : [`${SEED_PATHS.settings}: ${path}: ${seedKey} has no record`];
    }
    return status === "published"
      ? []
      : [`${SEED_PATHS.settings}: ${path}: ${seedKey} is ${status}, where ${rule} takes published cars only`];
  });
  const waitable = entries.filter(({ canWait }) => canWait).map(({ seedKey }) => seedKey);
  return { problems, skipped: waitingLine(context, "check 4: the showcase's", waitable) };
}

/**
 * Check 4: the codes, the makes and models, and the showcase. A slug ends in its code whole (BR-16),
 * so the codes being unique makes the slugs unique, and carSlug keeps a slug within 160 characters.
 */
function references(context: Context): Found {
  const { files, cars } = context;
  const showcase = showcaseProblems(context);
  return {
    problems: [
      ...cars.flatMap(({ record }) => referenceProblems(record, files)),
      ...repeats(cars, ({ record }) => record.refCode).map(({ item, first }) =>
        inCars(item.record.seedKey, `refCode: ${item.record.refCode} repeats ${first.item.record.seedKey}'s`),
      ),
      ...showcase.problems,
    ],
    skipped: showcase.skipped,
  };
}

// Check 5

/** Check 5: each VIN's check digit (BR-23), and its stored decode against its car (§6.2) */
function vins(context: Context): Found {
  const { files, cars } = context;
  if (files.vins === null) {
    return { problems: [], skipped: [`check 5: the VINs, as ${SEED_PATHS.vins} isn't in this clone (§6.1)`] };
  }
  const records = new Map(cars.map(({ record }) => [record.seedKey, record]));
  const problems = Object.entries(files.vins).flatMap(([seedKey, { vin, payload }]) => {
    const record = records.get(seedKey);
    if (record === undefined) {
      return waitsFor(context, seedKey) ? [] : [`${SEED_PATHS.vins}: ${seedKey}: no record in ${SEED_PATHS.cars}`];
    }
    const checked = checkVin(vin);
    // A warning lets a dealer keep a VIN from outside North America, but every seed VIN has its check digit (§6.1)
    const issue = checked.ok ? checked.warning : checked.error;
    const decoded = [
      ["makeKey", payload.makeKey, record.car.makeKey],
      ["modelKey", payload.modelKey, record.car.modelKey],
      ["year", payload.year, record.car.modelYear],
    ] as const;
    return [
      ...(issue === null ? [] : [`vin: ${issue} (BR-23)`]),
      ...decoded.flatMap(([field, value, recorded]) =>
        value === recorded ? [] : [`payload.${field}: ${shown(value)}, where the record has ${shown(recorded)}`],
      ),
    ].map((detail) => `${SEED_PATHS.vins}: ${seedKey}: ${detail}`);
  });
  return { problems, skipped: waitingLine(context, "check 5: the VINs of", Object.keys(files.vins)) };
}

// Check 6

/** The milestone a car entered Jordan at: its port, or the free zone for a car that came by road (§1) */
function entryIndex(journey: SeedCar["journey"]): number {
  const port = journey.findIndex(({ type }) => type === "arrived_port");
  return port === -1 ? journey.findIndex(({ type }) => type === "free_zone") : port;
}

/** An import that entered Jordan before its rules changed (A-11) */
function entryProblems({ journey, car }: SeedCar, { milestones }: SeedCarRows, rulesFrom: string): string[] {
  if (journey.length === 0) {
    // An agency car without a journey has no import to check, unless it is electric: §10 check 6
    // checks every electric car's import explicitly
    const noImport = car.regionalSpecs === "agency" && car.fuelType !== "electric";
    return noImport ? [] : ["journey: none, so its import can't be checked (A-11)"];
  }
  const index = entryIndex(journey);
  const entry = milestones[index];
  if (entry === undefined) return ["journey: no arrived_port or free_zone, so its import can't be checked (A-11)"];
  const at = `journey[${index}]`;
  if (entry.occurredMonth === null) return [`${at}.month: none, so the import can't be checked (A-11)`];
  if (entry.occurredMonth < rulesFrom) return [];
  // A salvage or rebuilt history, or an electric car, is named, as A-11 refuses them now
  const titles = journey.flatMap(({ titleBrand }) =>
    titleBrand !== undefined && REFUSED_TITLES.has(titleBrand) ? [titleBrand] : [],
  );
  const history = titles.length === 0 ? "" : ` with a ${[...new Set(titles)].join(" and ")} history`;
  const subject = `this ${car.fuelType === "electric" ? "electric " : ""}car${history}`;
  return [
    `${at}: ${subject} entered Jordan at ${entry.type} in ${monthOf(entry.occurredMonth)}, not before ${rulesFrom}, when the import rules changed (A-11)`,
  ];
}

/** The one import after the rules changed meets them (A-11) */
function exceptionProblems({ car, journey }: SeedCar, minimumYear: number): string[] {
  const since = "where an import since the rules changed (A-11)";
  const problems: string[] = [];
  if (car.regionalSpecs === null || !NEW_RULE_SPECS.includes(car.regionalSpecs)) {
    problems.push(`car.regionalSpecs: ${shown(car.regionalSpecs)}, ${since} has one of ${NEW_RULE_SPECS.join(", ")}`);
  }
  if (car.fuelType === "electric") problems.push(`car.fuelType: electric, ${since} isn't electric`);
  if (car.modelYear === null || car.modelYear < minimumYear) {
    problems.push(`car.modelYear: ${shown(car.modelYear)}, ${since} is a ${minimumYear} model or later`);
  }
  journey.forEach(({ type, titleBrand }, index) => {
    if (type === "auction" && titleBrand !== "clean") {
      problems.push(`journey[${index}].titleBrand: ${shown(titleBrand)}, ${since} has a clean title`);
    }
  });
  return problems;
}

/** Check 6: every import entered Jordan before its rules changed, but the one exception, which meets them */
function regulation({ files, cars, now }: Context): Found {
  const { importRulesFrom, importException } = files.expectations;
  const minimumYear = Number(ammanDate(now).slice(0, 4)) - NEW_RULE_MODEL_YEARS;
  return {
    problems: cars.flatMap(({ record, rows }) =>
      (record.seedKey === importException
        ? exceptionProblems(record, minimumYear)
        : entryProblems(record, rows, importRulesFrom)
      ).map((detail) => inCars(record.seedKey, detail)),
    ),
  };
}

// Check 7

/** BR-08: a declared state its reading contradicts, which only the dealer is warned of (FR-37.4) */
function contradicts({ state, microns }: SeedPanel, bands: MicronBands): boolean {
  if (microns === null) return false;
  const band = micronBand(microns, bands);
  return (state === "original" && band !== "factory") || (state === "repainted" && band === "factory");
}

/**
 * §5.2: a gauge reads a steel bumper and a metal roof, but neither a plastic bumper nor a glass
 * roof, and the record marks the steel and the glass
 */
function markProblems({ panels }: SeedInspection): string[] {
  return panels.flatMap(({ panelId, state, microns, steel, glass }, index) => {
    const bumper = BUMPERS.has(panelId);
    return failing([
      [steel === true && !bumper, `${panelId} is marked steel, which only a bumper is`],
      [steel === true && bumper && microns === null, `${panelId} is a steel bumper without a reading`],
      [steel !== true && bumper && microns !== null, `${panelId} has a reading, where a plastic bumper has none`],
      [glass === true && panelId !== "roof", `${panelId} is marked glass, which only the roof is`],
      [glass === true && microns !== null, `${panelId} is marked glass and has a reading, which a gauge can't take`],
      [
        panelId === "roof" && state !== "unknown" && microns === null && glass !== true,
        `${panelId} has no reading, where a metal roof has one and a glass roof is marked`,
      ],
    ]).map((detail) => `inspection.panels[${index}]: ${detail} (§5.2)`);
  });
}

/** §5.2: each drawn reading is drawReading's, from the inspection's range */
function drawnProblems(seedKey: string, { originalMicrons: range, panels }: SeedInspection): string[] {
  if (range !== null && range[0] > range[1]) {
    return [`inspection.originalMicrons: ${range[0]} to ${range[1]} runs backwards (§5.2)`];
  }
  return panels.flatMap(({ panelId, microns, drawn }, index) => {
    if (drawn !== true) return [];
    const at = `inspection.panels[${index}]`;
    if (range === null) {
      return [`${at}: ${panelId}'s reading is drawn, but inspection.originalMicrons gives no range (§5.2)`];
    }
    const reading = drawReading(seedKey, panelId, range);
    return microns === reading
      ? []
      : [
          `${at}: ${panelId} reads ${shown(microns)}, where its draw from ${range[0]} to ${range[1]} gives ${reading} (§5.2)`,
        ];
  });
}

/** §5's inspection for the car: complete, a stated count of items filled, or none */
function filledProblems(inspection: SeedInspection | null, expected: CarExpected["inspection"]): string[] {
  const wanted = expected === "none" ? null : expected === "complete" ? INSPECTION_ITEMS : expected.filled;
  const filled = filledOf(inspection);
  const described = (count: number | null) =>
    count === null ? "none" : `${count} of ${INSPECTION_ITEMS} items filled`;
  return filled === wanted
    ? []
    : [`inspection: ${described(filled)}, where ${SEED_PATHS.expectations} has ${described(wanted)}`];
}

/** Check 7: the bumpers and the roof, the filled counts of §5, the drawn readings, and BR-08's deliberate contradiction */
function inspections(context: Context): Found {
  const { files, cars } = context;
  const { expectations } = files;
  const bands = files.settings.advanced.micronBands;
  const perCar = cars.flatMap(({ record }) => {
    const { inspection } = record;
    const wanted = expectations.cars[record.seedKey]?.inspection;
    return [
      ...(wanted === undefined ? [] : filledProblems(inspection, wanted)),
      ...(inspection === null ? [] : [...markProblems(inspection), ...drawnProblems(record.seedKey, inspection)]),
    ].map((detail) => inCars(record.seedKey, detail));
  });
  const found = cars.flatMap(({ record }) =>
    (record.inspection?.panels ?? []).flatMap((panel, index) =>
      contradicts(panel, bands) ? [{ seedKey: record.seedKey, panel, index }] : [],
    ),
  );
  const written = new Set(cars.map(({ record }) => record.seedKey));
  const expected = expectations.contradictions.filter(({ car }) => written.has(car));
  const unexpected = found
    .filter(
      ({ seedKey, panel }) => !expected.some(({ car, panel: panelId }) => car === seedKey && panelId === panel.panelId),
    )
    .map(({ seedKey, panel, index }) =>
      inCars(
        seedKey,
        `inspection.panels[${index}]: ${panel.panelId} is ${panel.state} at ${shown(panel.microns)}, a BR-08 contradiction ${SEED_PATHS.expectations} doesn't list (§5.5)`,
      ),
    );
  const missing = expected
    .filter(
      ({ car, panel: panelId }) => !found.some(({ seedKey, panel }) => seedKey === car && panel.panelId === panelId),
    )
    .map(({ car, panel }) =>
      inCars(
        car,
        `inspection: ${panel} holds no BR-08 contradiction, where ${SEED_PATHS.expectations} lists one (§5.5)`,
      ),
    );
  const listedOn = expectations.contradictions.map(({ car }) => car);
  return {
    problems: [...perCar, ...unexpected, ...missing],
    skipped: waitingLine(context, "check 7: the BR-08 contradictions on", listedOn),
  };
}

// Check 8

/**
 * Check 8: each milestone's place, in_showroom last, and each place's OpenStreetMap source with its
 * coordinates (§7). The app's journey schema, in check 1, holds the 10 milestones and the auctions' titles.
 */
function journeys({ files, cars }: Context): Found {
  const places = new Set(files.places.map(({ key }) => key));
  const sources = new Map(files.sources.map((source) => [source.key, source]));
  const perCar = cars.flatMap(({ record: { seedKey, journey } }) => {
    const showroom = journey.findIndex(({ type }) => type === "in_showroom");
    return [
      ...journey.flatMap(({ place }, index) =>
        place === null || places.has(place)
          ? []
          : [`journey[${index}].place: ${place} isn't a place in ${SEED_PATHS.places}`],
      ),
      ...(showroom === -1 || showroom === journey.length - 1
        ? []
        : [`journey[${showroom}]: in_showroom, which comes last when a journey has it`]),
    ].map((detail) => inCars(seedKey, detail));
  });
  const unsourced = files.places.flatMap(({ key, lat, lng }) => {
    const source = sources.get(key);
    if (source === undefined) return [`${SEED_PATHS.places}: ${key}: no source in ${SEED_PATHS.sources}`];
    return source.lat === lat && source.lng === lng
      ? []
      : [`${SEED_PATHS.sources}: ${key}: ${source.lat}, ${source.lng}, where ${SEED_PATHS.places} has ${lat}, ${lng}`];
  });
  return {
    problems: [
      ...perCar,
      ...unsourced,
      ...files.sources.flatMap(({ key }) =>
        places.has(key) ? [] : [`${SEED_PATHS.sources}: ${key}: no place has this key`],
      ),
      ...repeats(files.sources, ({ key }) => key).map(({ item }) => `${SEED_PATHS.sources}: ${item.key}: listed twice`),
    ],
  };
}

// Check 12

/** The trade words a text writes outside brackets (D-007) */
function bareTradeWords(text: string): string[] {
  const outside = text.replace(BRACKETED, " ").replace(INSIDE_WORDS, "");
  return Array.from(outside.matchAll(WORD), ([word]) => word).filter((word) => TRADE_FORMS.has(word));
}

/** C-07's dashes, digits other than 0 to 9, and D-007's trade words outside brackets */
function textProblems(text: string): string[] {
  const digits = [...new Set(text.match(FOREIGN_DIGIT))];
  return [
    ...dashesIn(text).map(({ dash }) => `${dash} (C-07)`),
    ...(digits.length === 0 ? [] : [`${digits.join(" ")}: digits other than 0 to 9`]),
    ...bareTradeWords(text).map((word) => `${word} outside brackets, where D-007 puts the formal word first`),
  ];
}

/**
 * Check 12: no long dash, no digit but 0 to 9 and no bare trade word in any seed text, and both
 * languages of every description of a car that was published
 */
function copy({ files, cars }: Context): Found {
  const texts = [
    ...cars.flatMap(({ record }) =>
      textsIn(record).map((text) => ({ ...text, file: `${SEED_PATHS.cars}: ${record.seedKey}` })),
    ),
    ...textsIn(files.reference).map((text) => ({ ...text, file: SEED_PATHS.reference })),
    ...files.places.flatMap((place) =>
      textsIn(place).map((text) => ({ ...text, file: `${SEED_PATHS.places}: ${place.key}` })),
    ),
    ...textsIn(files.settings).map((text) => ({ ...text, file: SEED_PATHS.settings })),
  ];
  const descriptions = cars.flatMap(({ record: { seedKey, status, car } }) => {
    if (!PUBLISHED_ONCE.has(status) || (car.descriptionAr === null) === (car.descriptionEn === null)) return [];
    const missing = car.descriptionAr === null ? "car.descriptionAr" : "car.descriptionEn";
    return [inCars(seedKey, `${missing}: none, where the other language has a description`)];
  });
  return {
    problems: [
      ...texts.flatMap(({ file, path, text }) => textProblems(text).map((problem) => `${file}: ${path}: ${problem}`)),
      ...descriptions,
    ],
  };
}

// Check 13

/** The EPA's figures where §5 gives them, both of them, and no EPA source where it doesn't */
function epaProblems(car: SeedCar["car"], epa: CarExpected["epa"]): string[] {
  if (epa === null) {
    return car.consumptionSource === "epa"
      ? [`car.consumptionSource: epa, where ${SEED_PATHS.expectations} has no EPA figures`]
      : [];
  }
  const figures = [
    ["consumptionLPer100km", car.consumptionLPer100km, epa.lPer100km ?? null],
    ["consumptionKwhPer100km", car.consumptionKwhPer100km, epa.kwhPer100km ?? null],
  ] as const;
  return [
    ...(car.consumptionSource === "epa"
      ? []
      : [
          `car.consumptionSource: ${shown(car.consumptionSource)}, where ${SEED_PATHS.expectations} has the EPA's figures`,
        ]),
    ...figures.flatMap(([field, value, wanted]) =>
      value === wanted ? [] : [`car.${field}: ${shown(value)}, where the EPA's is ${shown(wanted)}`],
    ),
  ];
}

/** Check 13: the EPA's figures, a source for every consumption value, and both figures on a plug-in hybrid */
function runningData({ files, cars }: Context): Found {
  return {
    problems: cars.flatMap(({ record: { seedKey, car } }) => {
      const litres = car.consumptionLPer100km;
      const kwh = car.consumptionKwhPer100km;
      const epa = files.expectations.cars[seedKey]?.epa;
      return [
        ...failing([
          [
            car.consumptionSource === null && (litres !== null || kwh !== null),
            "car.consumptionSource: none, where a consumption value has its source",
          ],
          [
            car.fuelType === "plugin_hybrid" && (litres === null || kwh === null),
            "car.consumptionLPer100km, car.consumptionKwhPer100km: a plug-in hybrid has both",
          ],
        ]),
        ...(epa === undefined ? [] : epaProblems(car, epa)),
      ].map((detail) => inCars(seedKey, detail));
    }),
  };
}

// Check 14

/** §9.1: a car's days as its status has them, published once it was, sold only when it is, in order */
function statusProblems({ status, seedOffsets }: SeedCar): string[] {
  const { published, sold, inspectedOn } = seedOffsets;
  const problems: string[] = [];
  if (PUBLISHED_ONCE.has(status) !== (published !== undefined)) {
    problems.push(`seedOffsets.published: ${shown(published)} for a ${status} car`);
  }
  if ((status === "sold") !== (sold !== undefined)) {
    problems.push(`seedOffsets.sold: ${shown(sold)} for a ${status} car`);
  }
  if (published !== undefined && sold !== undefined && sold <= published) {
    problems.push(`seedOffsets.sold: ${sold}, not after seedOffsets.published, ${published}`);
  }
  if (published !== undefined && inspectedOn !== undefined && inspectedOn > published) {
    problems.push(`seedOffsets.inspectedOn: ${inspectedOn}, after seedOffsets.published, ${published}`);
  }
  return problems;
}

/** BR-05's changes: each a change, after the car was published and after the one before, the newest to its price */
function priceChangeProblems({ seedOffsets, car }: SeedCar): string[] {
  const { published, priceChanges } = seedOffsets;
  const problems: string[] = [];
  priceChanges.forEach(({ days, from, to }, index) => {
    const at = `seedOffsets.priceChanges[${index}]`;
    const before = priceChanges[index - 1];
    if (published === undefined || days <= published) {
      problems.push(`${at}.days: ${days}, not after seedOffsets.published, ${shown(published)}`);
    }
    if (before !== undefined && days <= before.days) {
      problems.push(`${at}.days: ${days}, not after the change before it`);
    }
    if (from === to) problems.push(`${at}: from ${from} to ${to}, which changes nothing`);
  });
  const [newest] = priceChanges.toSorted((first, second) => second.days - first.days);
  if (newest !== undefined && newest.to !== car.priceJod) {
    problems.push(
      `seedOffsets.priceChanges: the newest is to ${newest.to}, where car.priceJod is ${shown(car.priceJod)}`,
    );
  }
  return problems;
}

/** §9.1: an offset dates a milestone without a month of its own, in the journey's order, after every fixed month */
function milestoneProblems({ journey, seedOffsets }: SeedCar, { milestones }: SeedCarRows): string[] {
  const offsets = new Map(
    Object.entries(seedOffsets.milestones).flatMap(([type, days]) =>
      days === undefined ? [] : [[type, days] as const],
    ),
  );
  const problems = [...offsets.keys()]
    .filter((type) => !journey.some((milestone) => milestone.type === type))
    .map((type) => `seedOffsets.milestones.${type}: the journey has no ${type}`);
  const latestFixed = journey.reduce<{ readonly month: string; readonly index: number } | undefined>(
    (latest, { month }, index) =>
      month !== null && (latest === undefined || month > latest.month) ? { month, index } : latest,
    undefined,
  );
  let before: { readonly type: string; readonly days: number } | undefined;
  journey.forEach(({ type, month }, index) => {
    const days = offsets.get(type);
    if (days === undefined) return;
    const at = `journey[${index}]`;
    if (month !== null) {
      problems.push(`${at}.month: ${month}, where seedOffsets.milestones.${type} dates it`);
      return;
    }
    if (before !== undefined && days < before.days) {
      problems.push(`${at}: ${type}'s offset, ${days}, falls before ${before.type}'s, ${before.days}`);
    }
    before = { type, days };
    const occurred = milestones[index]?.occurredMonth ?? null;
    if (latestFixed !== undefined && occurred !== null && monthOf(occurred) < latestFixed.month) {
      problems.push(
        `${at}: ${type} falls in ${monthOf(occurred)}, before journey[${latestFixed.index}]'s ${latestFixed.month}`,
      );
    }
  });
  return problems;
}

/** The change the car page and the cards read: the newest */
const newestChange = (changes: readonly PriceChange[]) =>
  changes.reduce<PriceChange | null>(
    (newest, change) => (newest === null || change.changedAt > newest.changedAt ? change : newest),
    null,
  );

/** §4.1's badges and note on the day, on every car the public sees, a sold one inside its window included */
function badgeProblems(context: Context): { problems: string[]; skipped: string[] } {
  const { files, cars, now } = context;
  const cutoff = soldCutoff(now, files.settings.advanced.soldVisibleDays);
  const seen = cars.filter(({ rows }) => isPublic(rows.car, cutoff)).map(({ rows }) => rows);
  const drops = seen.map((rows) => ({ seedKey: rows.seedKey, drop: priceDrop(newestChange(rows.priceChanges), now) }));
  const found: Record<(typeof BADGES)[number]["badge"], string[]> = {
    new: seen.filter(({ car }) => isNewArrival(car.publishedAt, now)).map(({ seedKey }) => seedKey),
    priceReduced: drops.filter(({ drop }) => drop !== null).map(({ seedKey }) => seedKey),
    priceDropped: drops.filter(({ drop }) => drop?.badge === true).map(({ seedKey }) => seedKey),
  };
  const written = new Set(cars.map(({ record }) => record.seedKey));
  const sameKeys = (first: readonly string[], second: readonly string[]) =>
    first.toSorted().join() === second.toSorted().join();
  const problems = BADGES.flatMap(({ badge, name }) => {
    const expected = files.expectations.badges[badge].filter((seedKey) => written.has(seedKey));
    return sameKeys(found[badge], expected)
      ? []
      : [
          `${SEED_PATHS.cars}: ${name} on ${listed(found[badge])} on ${ammanDate(now)}, where ${SEED_PATHS.expectations} has ${listed(expected)}`,
        ];
  });
  const listedFor = BADGES.flatMap(({ badge }) => files.expectations.badges[badge]);
  return { problems, skipped: waitingLine(context, "check 14: the badges of", listedFor) };
}

/** Check 14: the offsets fit the car's status and one another, and give §4.1's badges on the day */
function offsets(context: Context): Found {
  const badges = badgeProblems(context);
  return {
    problems: [
      ...context.cars.flatMap(({ record, rows }) =>
        [...statusProblems(record), ...priceChangeProblems(record), ...milestoneProblems(record, rows)].map((detail) =>
          inCars(record.seedKey, detail),
        ),
      ),
      ...badges.problems,
    ],
    skipped: badges.skipped,
  };
}

// §10's checks that T-17 writes, in its order. Checks 9, 10 and 11 are T-18's.
const CHECKS: ReadonlyArray<(context: Context) => Found> = [
  schemas,
  counts,
  publishRules,
  references,
  vins,
  regulation,
  inspections,
  journeys,
  copy,
  runningData,
  offsets,
];

/** Each record beside its rows, which seedRows gives in the records' order */
function paired(files: SeedFiles, rows: SeedRows): SeedCarPair[] {
  return files.cars.map((record, index) => {
    const carRows = rows.cars[index];
    if (carRows?.seedKey !== record.seedKey) throw new Error(`seedRows moved ${record.seedKey}'s rows`);
    return { record, rows: carRows };
  });
}

/**
 * §10's checks over the files, on the Amman day of `now`. A partial run, for the batches that write
 * the cars, takes each car of scripts/seed-expectations.json that seed/cars.json doesn't hold yet as
 * waiting rather than missing, and leaves the totals until every car is written. The showcase's hero
 * must be written all the same, as the live settings refer to its row.
 */
export function seedChecks(files: SeedFiles, now: Date, { partial }: { readonly partial: boolean }): SeedCheckReport {
  const rows = seedRows(files, now);
  const written = new Set(files.cars.map(({ seedKey }) => seedKey));
  const unwritten = new Set(Object.keys(files.expectations.cars).filter((seedKey) => !written.has(seedKey)));
  const context: Context = { files, rows, cars: paired(files, rows), now, partial, unwritten };
  const found = CHECKS.map((check) => check(context));
  return {
    problems: found.flatMap(({ problems }) => problems),
    pending: PENDING_CHECKS,
    skipped: found.flatMap(({ skipped = [] }) => skipped),
  };
}
