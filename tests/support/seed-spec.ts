import { slugify } from "@/features/dealer/domain/slug";
import { PANEL_IDS } from "@/lib/db/enums";
import { FEATURE_KEYS } from "@/lib/db/feature-keys";
import { parseStrict, type SeedCar, seedCarsSchema } from "@/lib/validation/seed";

// 05-SEED-DATA read as its records are written (§5.1), for the private test that holds the seed
// files to it (tests/unit/seed/spec.test.ts). Each function takes a document's text, so the test
// reads the docs inside its own body. §5.2's defaults are filled in, so a car comes out in
// seed/cars.json's shape, parsed by its schema, with each drawn reading left null for the test to
// check against its range. Wording the reader doesn't know stops it, naming what it couldn't read.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const BUMPERS = new Set<string>(["front_bumper", "rear_bumper"]);
const MECHANICAL_ITEMS = ["chassis", "engine", "gearbox"] as const;
const FEATURES = new Set<string>(FEATURE_KEYS);
// The cars whose engine burns petrol, which take §5.2's octane unless the record gives one
const PETROL_ENGINES = new Set(["gasoline", "hybrid", "mild_hybrid", "plugin_hybrid"]);
// The milestones a record may leave without a place, which §5.2 puts in Amman
const AMMAN_MILESTONES = new Set(["inspected", "in_showroom"]);
// A note as records write it, "EN" / "AR"
const NOTE = /"([^"]+)" \/ "([^"]+)"/g;
// What an inspection or a journey step says that sets no value
const INSPECTION_REMARKS = [/labelled "Electric motor"/, /^\*\*Deliberate:\*\* /, /^Buyers see the reading /];
const JOURNEY_REMARKS = [/^the same place, so the globe pulses /];

/** The match, or an error quoting what SEED wrote that doesn't read */
function read(pattern: RegExp, text: string, what: string): RegExpExecArray {
  const found = pattern.exec(text);
  if (!found) throw new Error(`05-SEED-DATA: ${what} doesn't read: ${text}`);
  return found;
}

/** A figure as SEED writes it, with thousands commas: 47,500 */
const figure = (text: string) => Number(text.replaceAll(",", ""));
/** A day offset from the days SEED writes after its minus sign: −9 is -9 */
const ago = (days: string) => -Number(days);
/** The text up to the end of its first sentence */
const firstSentence = (text: string) => text.split(/\.(?:\s|$)/)[0] ?? "";
/** A backticked word's text */
const code = (text: string, what: string) => read(/^`([^`]+)`$/, text, what)[1] ?? "";
/** The seed keys a sentence names: S04, S12 and S28 */
const seedKeys = (text: string) => Array.from(text.matchAll(/S\d\d/g), ([record]) => record.toLowerCase());

/** An "EN / AR" pair */
function pair(text: string, what: string): [string, string] {
  const [, en = "", ar = ""] = read(/^(.+?) \/ (.+)$/, text, what);
  return [en, ar];
}

/** "Dec 2018" as a record's month: 2018-12 */
function monthOf(text: string): string {
  const [, name = "", year = ""] = read(/^(\w{3}) (\d{4})$/, text, "a month");
  return `${year}-${String(MONTHS.indexOf(name) + 1).padStart(2, "0")}`;
}

/** "25 Dec 2026" as a calendar date */
function dateOf(day: string, month: string, year: string): string {
  return `${monthOf(`${month} ${year}`)}-${day.padStart(2, "0")}`;
}

/** The object without its undefined values, as a parse leaves an absent optional key out */
function defined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, each]) => each !== undefined));
}

/** A section's text, from its heading to the next heading of its level or above */
function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`\n${heading}`);
  if (start === -1) throw new Error(`05-SEED-DATA: no heading "${heading.trim()}"`);
  const level = heading.indexOf(" ");
  const body = markdown.slice(start + 1);
  const next = body.slice(1).search(new RegExp(`\\n#{1,${level}} `));
  return next === -1 ? body : body.slice(0, next + 1);
}

/** The rows of each table in the text, as trimmed cells, without the header and divider rows */
function tables(text: string): string[][][] {
  const found: string[][][] = [];
  let lines: string[] = [];
  for (const line of [...text.split("\n"), ""]) {
    if (line.startsWith("|")) {
      lines.push(line);
      continue;
    }
    if (lines.length > 2)
      found.push(
        lines.slice(2).map((row) =>
          row
            .split("|")
            .slice(1, -1)
            .map((cell) => cell.trim()),
        ),
      );
    lines = [];
  }
  return found;
}

/** The text's notes swapped for @0, @1 and so on, so its punctuation can be split on */
function withoutNotes(text: string): { bare: string; notes: { en: string; ar: string }[] } {
  const notes: { en: string; ar: string }[] = [];
  const bare = text.replace(NOTE, (_, en: string, ar: string) => `@${notes.push({ en, ar }) - 1}`);
  return { bare, notes };
}

// §4.1

export type SpecOverviewRow = {
  readonly seedKey: string;
  readonly refCode: string;
  readonly fuelType: string;
  readonly regionalSpecs: string;
  readonly mileageKm: number;
  readonly priceJod: number | null;
  readonly status: string;
  readonly published: number | null;
  readonly sold: number | null;
  readonly tier: string;
  readonly inspection: string;
};

/** §4.1's table, one row a car */
export function specOverview(seed: string): SpecOverviewRow[] {
  const [rows = []] = tables(section(seed, "### 4.1 "));
  return rows.map(
    ([
      record = "",
      refCode = "",
      ,
      fuelType = "",
      regionalSpecs = "",
      km = "",
      price = "",
      status = "",
      tier = "",
      inspection = "",
    ]) => {
      const [, state = "", days, published] = read(/^(\w+)(?: \((\d+)(?:; published (\d+))?\))?$/, status, "a status");
      const sold = state === "sold";
      return {
        seedKey: record.toLowerCase(),
        refCode,
        fuelType,
        regionalSpecs,
        mileageKm: figure(km),
        priceJod: price === "(none)" ? null : figure(price),
        status: state,
        published: days === undefined ? null : ago(sold ? (published ?? "") : days),
        sold: sold && days !== undefined ? ago(days) : null,
        tier: read(/^([ABC])\b/, tier, "a tier")[1] ?? "",
        inspection,
      };
    },
  );
}

/** §4.1's totals: the fuel and body mix, the freshly inspected count and the badges */
export function specInventory(seed: string) {
  const text = section(seed, "### 4.1 ");
  const counts = (label: string, words: Record<string, string>) => {
    const [, list = ""] = read(new RegExp(`\\*\\*${label}:\\*\\* (.+?)\\.$`, "m"), text, `the ${label} mix`);
    return Object.fromEntries(
      list.split(", ").map((part) => {
        const [, count = "", word = ""] = read(/^(\d+) (.+)$/, part, `a ${label} count`);
        const name = words[word];
        if (name === undefined) throw new Error(`05-SEED-DATA: no ${label} named "${word}"`);
        return [name, Number(count)];
      }),
    );
  };
  const [, reduced = "", dropped = ""] = read(
    /\*\*Price reduced\*\* .*?: (.+?)\. The "Price dropped" (.+)$/m,
    text,
    "the price badges",
  );
  return {
    mix: {
      fuel: counts("Fuel", {
        hybrids: "hybrid",
        electric: "electric",
        "plug-in hybrids": "plugin_hybrid",
        petrol: "gasoline",
        diesel: "diesel",
      }),
      body: counts("Body", {
        sedans: "sedan",
        SUVs: "suv",
        hatchbacks: "hatchback",
        pickup: "pickup",
        van: "van",
        coupe: "coupe",
      }),
    },
    publicWithCompleteInspection: Number(
      read(/\*\*Freshly inspected:\*\* (\d+) public cars/, text, "the freshly inspected count")[1],
    ),
    badges: {
      new: seedKeys(read(/\*\*"New" badge:\*\* (.+)$/m, text, "the new badge")[1] ?? ""),
      priceReduced: seedKeys(reduced),
      priceDropped: seedKeys(dropped),
    },
  };
}

/** §1 rule 6: the day Jordan's import rules changed, and the one car that entered after it */
export function specImportRules(seed: string) {
  const [, day = "", month = "", year = ""] = read(
    /before (\d{1,2}) (\w{3}) (\d{4}), when Jordan's new import rules began/,
    seed,
    "the import rules' date",
  );
  return {
    importRulesFrom: dateOf(day, month, year),
    importException: (read(/The exception is (S\d\d)/, seed, "the import exception")[1] ?? "").toLowerCase(),
  };
}

// §5.4 and §5.5

type Field = { readonly text: string; readonly paren: string | null; readonly items: string[] };

// A record's line: - **Identity:** text, or - **Inspection** (inspected −11): text
const FIELD = /^- \*\*([^*]+?)(?::\*\*| ?\*\* \(([^)]+)\):)\s*(.*)$/;

/** Each record's heading, and its fields by label with their sub-items */
function recordTexts(seed: string): { heading: string; fields: Map<string, Field> }[] {
  const text = seed.slice(seed.indexOf("\n### 5.4 "), seed.indexOf("\n### 5.6 "));
  return text
    .split("\n#### ")
    .slice(1)
    .map((chunk) => {
      const [heading = "", ...lines] = chunk.split("\n");
      const fields = new Map<string, Field>();
      let last: Field | undefined;
      for (const line of lines) {
        const field = FIELD.exec(line);
        if (field) {
          last = { text: field[3] ?? "", paren: field[2] ?? null, items: [] };
          fields.set(field[1] ?? "", last);
        } else if (line.startsWith("  - ")) {
          last?.items.push(line.slice(4));
        }
      }
      return { heading, fields };
    });
}

/** §5.2's feature packs: P1 to P4 and their keys */
function featurePacks(seed: string): Map<string, string[]> {
  return new Map(
    Array.from(seed.matchAll(/^\| (P\d) [^|]+\| (.+) \|$/gm), ([, pack = "", keys = ""]) => [
      pack,
      Array.from(keys.matchAll(/`([a-z0-9_]+)`/g), ([, each = ""]) => each),
    ]),
  );
}

function identityOf(line: string) {
  const [
    make = "",
    model = "",
    trim = "",
    year = "",
    body = "",
    fuel = "",
    transmission = "",
    drive = "",
    cc = "",
    hp = "",
    seats = "",
    ...sizes
  ] = firstSentence(line).split(" · ");
  const size = (name: string) => {
    const given = sizes.find((each) => each.startsWith(`${name} `));
    return given === undefined ? null : figure(read(/^\w+ ([\d,]+) mm$/, given, `a ${name}`)[1] ?? "");
  };
  const unread = sizes.filter((each) => !/^(?:length|wheelbase) /.test(each));
  if (unread.length > 0) throw new Error(`05-SEED-DATA: an identity part doesn't read: ${unread.join(" · ")}`);
  return {
    makeKey: code(make, "a make key"),
    modelKey: code(model, "a model key"),
    trim: trim === "no trim" ? null : trim,
    modelYear: Number(read(/^\d{4}$/, year, "a model year")[0]),
    bodyType: body,
    fuelType: fuel,
    transmission,
    drivetrain: drive,
    engineCc: figure(read(/^([\d,]+) cc$/, cc, "an engine size")[1] ?? ""),
    powerHp: figure(read(/^([\d,]+) hp$/, hp, "a power figure")[1] ?? ""),
    seats: Number(read(/^(\d+) seats$/, seats, "the seats")[1]),
    lengthMm: size("length"),
    wheelbaseMm: size("wheelbase"),
  };
}

function paintOf(line: string) {
  const [, outside = "", inside = ""] = read(/^(.+?)\. Interior: (.+?)\.$/, line, "a paint line");
  const [names = "", hex = "", finish = "", family = ""] = outside.split(" · ");
  const [nameEn, nameAr] = pair(names, "a colour's names");
  const [interiorEn, interiorAr] = pair(inside, "an interior's names");
  return {
    exteriorColorNameAr: nameAr,
    exteriorColorNameEn: nameEn,
    exteriorColorHex: code(hex, "a colour").toLowerCase(),
    paintFinish: finish,
    colorFamily: family,
    interiorColorNameAr: interiorAr,
    interiorColorNameEn: interiorEn,
  };
}

function jordanOf(line: string) {
  const parts = firstSentence(line.replaceAll("**", "")).split(" · ");
  const [specs = "", customs = "", license = "", insurance = "", payment = "", owners = "", ...rest] = parts;
  const [, licenseStatus = "", months] = read(
    /^(licensed|unlicensed)(?:, (?:expiry )?\+(\d+) months?| \(no expiry\))?$/,
    license,
    "a licence",
  );
  const warranty =
    rest.length === 0
      ? null
      : (read(/^`warranty_until` (\d{4}-\d{2}-\d{2})$/, rest.join(" · "), "a warranty")[1] ?? "");
  return {
    car: {
      regionalSpecs: specs,
      customsStatus: customs,
      licenseStatus,
      insuranceType: insurance.replace(/^insurance /, ""),
      paymentMethods: payment.split(", "),
      ownersCount: Number(read(/^(\d+) owners?$/, owners, "the owners")[1]),
      warrantyUntil: warranty,
    },
    licenseExpiryMonths: months === undefined ? undefined : Number(months),
    vin: /VIN `([A-HJ-NPR-Z0-9]{17})`/.exec(line)?.[1] ?? null,
  };
}

/** The price line's status, price and offsets; a draft has a status line instead */
function datesOf(fields: ReadonlyMap<string, Field>) {
  const draft = fields.get("Status");
  if (draft !== undefined) {
    const [, created = ""] = read(/^`draft`, created −(\d+)/, draft.text, "a draft's status");
    return {
      status: "draft",
      priceJod: null,
      published: undefined,
      sold: undefined,
      priceChanges: [],
      createdOffset: ago(created),
    };
  }
  const line = fields.get("Price and dates")?.text ?? "";
  const sold = /sold −(\d+)/.exec(line)?.[1];
  return {
    status: sold !== undefined ? "sold" : line.includes("then `reserved`") ? "reserved" : "published",
    priceJod: figure(read(/^([\d,]+) JOD/, line, "a price")[1] ?? ""),
    published: ago(read(/published −(\d+)/, line, "a publish offset")[1] ?? ""),
    sold: sold === undefined ? undefined : ago(sold),
    priceChanges: Array.from(
      line.matchAll(/price change −(\d+) from ([\d,]+) to ([\d,]+)/g),
      ([, days = "", from = "", to = ""]) => ({
        days: ago(days),
        from: figure(from),
        to: figure(to),
      }),
    ),
    createdOffset: undefined,
  };
}

function runningOf(line: string | undefined, fuelType: string) {
  const found = (pattern: RegExp) => (line === undefined ? undefined : pattern.exec(line)?.[1]);
  const octane = found(/octane (\d+)/);
  const litres = found(/([\d.]+) L\/100 km/);
  const kwh = found(/([\d.]+) kWh\/100 km/);
  const source = found(/100 km \((EPA|dealer)\b/);
  const battery = line === undefined ? null : /battery (\d+)%, `([a-z_]+)`/.exec(line);
  const share = found(/electric share (\d+)%/);
  const consumption = litres !== undefined || kwh !== undefined;
  if (consumption && source === undefined) throw new Error(`05-SEED-DATA: a consumption without its source: ${line}`);
  return {
    car: {
      recommendedOctane: octane !== undefined ? Number(octane) : PETROL_ENGINES.has(fuelType) ? 90 : null,
      consumptionLPer100km: litres === undefined ? null : Number(litres),
      consumptionKwhPer100km: kwh === undefined ? null : Number(kwh),
      consumptionSource: consumption ? (source ?? "").toLowerCase() : null,
      batterySohPct: battery ? Number(battery[1]) : null,
      batterySohSource: battery?.[2] ?? null,
      phevElectricSharePct: share === undefined ? null : Number(share),
    },
    epa:
      source === "EPA"
        ? {
            ...(litres === undefined ? {} : { lPer100km: Number(litres) }),
            ...(kwh === undefined ? {} : { kwhPer100km: Number(kwh) }),
          }
        : null,
  };
}

// An inspection line's statements, in the forms §5.4 and §5.5 use
const STATED = /^`([a-z_]+)` `([a-z_]+)`((?:, (?:steel|glass|no reading|\d+ µm))*)(?:: @(\d+))?$/;
const BOTH_STATED = /^`([a-z_]+)` and `([a-z_]+)` `([a-z_]+)`$/;
const STAY_UNKNOWN = /^((?:`[a-z_]+`(?:, | and ))*`[a-z_]+`) stay `unknown`$/;
const OTHERS_UNKNOWN = /^Every other panel and the `([a-z_]+)` stay `unknown`$/;
const ALL_UNKNOWN = /^every panel `unknown`$/;
const REST_ORIGINAL =
  /^(?:Other metal panels|Metal panels|all panels|all 13 panels) original, (\d+) to (\d+) µm$|^all 13 panels filled, original at (\d+) to (\d+) µm$/;
const LISTED_ORIGINAL = /^Original, (\d+) to (\d+) µm: (.+)$/;

type Item = Record<string, unknown> & { readonly state: string };

function inspectionOf(seedKey: string, field: Field | undefined) {
  if (field === undefined || field.text.startsWith("none")) return null;
  const [, days = "", filled] = read(
    /^inspected −(\d+)(?:, partial, (\d+) of 16)?$/,
    field.paren ?? "",
    "an inspection's heading",
  );
  const panels = new Map<string, Item>();
  const mechanical = new Map<string, Item>(MECHANICAL_ITEMS.map((item) => [item, { state: "sound" }]));
  const deliberate: string[] = [];
  let range: [number, number] | null = null;
  let others: "original" | "unknown" | null = null;

  const note = (notes: { en: string; ar: string }[], index: string | undefined) => {
    const given = index === undefined ? undefined : notes[Number(index)];
    return given === undefined ? {} : { noteEn: given.en, noteAr: given.ar };
  };

  for (const line of [field.text, ...field.items].filter((each) => each !== "")) {
    const { bare, notes } = withoutNotes(line);
    const statements = bare
      .replace(/\.$/, "")
      .split(/; |\. (?=\S)/)
      .flatMap((statement) => statement.split(/, and (?=`)/));
    // A note that ends a line declaring several panels goes on each of them (D-045)
    const linePanels: string[] = [];
    let lineNote: Record<string, string> = {};
    for (const statement of statements) {
      const stated = STATED.exec(statement);
      const both = BOTH_STATED.exec(statement);
      const stay = STAY_UNKNOWN.exec(statement);
      const othersUnknown = OTHERS_UNKNOWN.exec(statement);
      const rest = REST_ORIGINAL.exec(statement);
      const listed = LISTED_ORIGINAL.exec(statement);
      if (stated) {
        const [, id = "", state = "", extras = "", noteIndex] = stated;
        const given = note(notes, noteIndex);
        if (MECHANICAL_ITEMS.some((item) => item === id)) {
          mechanical.set(id, { state, ...given });
          continue;
        }
        const reading = /(\d+) µm/.exec(extras)?.[1];
        panels.set(id, {
          state,
          microns: reading === undefined ? null : Number(reading),
          ...(extras.includes(", steel") ? { steel: true } : {}),
          ...(extras.includes(", glass") ? { glass: true } : {}),
          ...given,
        });
        linePanels.push(id);
        if (noteIndex !== undefined) lineNote = given;
      } else if (both) {
        const [, first = "", second = "", state = ""] = both;
        for (const id of [first, second]) mechanical.set(id, { state });
      } else if (stay) {
        for (const [, id = ""] of (stay[1] ?? "").matchAll(/`([a-z_]+)`/g)) mechanical.set(id, { state: "unknown" });
      } else if (othersUnknown) {
        mechanical.set(othersUnknown[1] ?? "", { state: "unknown" });
        others = "unknown";
      } else if (ALL_UNKNOWN.test(statement)) {
        others = "unknown";
      } else if (rest) {
        const [, min, max, filledMin, filledMax] = rest;
        range = [Number(min ?? filledMin), Number(max ?? filledMax)];
        others = "original";
      } else if (listed) {
        const [, min = "", max = "", list = ""] = listed;
        range = [Number(min), Number(max)];
        for (const [, id = ""] of list.matchAll(/`([a-z_]+)`/g)) {
          panels.set(
            id,
            BUMPERS.has(id) ? { state: "original", microns: null } : { state: "original", microns: null, drawn: true },
          );
        }
      } else if (INSPECTION_REMARKS.some((remark) => remark.test(statement))) {
        if (statement.startsWith("**Deliberate:**")) deliberate.push(...linePanels);
      } else {
        throw new Error(`05-SEED-DATA ${seedKey}: an inspection statement doesn't read: ${statement}`);
      }
    }
    for (const id of linePanels) {
      const panel = panels.get(id);
      if (panel !== undefined && panel["noteEn"] === undefined) panels.set(id, { ...panel, ...lineNote });
    }
  }

  const panelList = PANEL_IDS.map((panelId) => {
    const stated = panels.get(panelId);
    if (stated !== undefined) return { panelId, ...stated };
    if (others === "unknown") return { panelId, state: "unknown", microns: null };
    if (others === "original") {
      return BUMPERS.has(panelId)
        ? { panelId, state: "original", microns: null }
        : { panelId, state: "original", microns: null, drawn: true };
    }
    throw new Error(`05-SEED-DATA ${seedKey}: nothing states the ${panelId}`);
  });
  const items = [...panelList, ...mechanical.values()];
  const filledItems = items.filter((item) => item.state !== "unknown").length;
  const expectedFilled = filled === undefined ? items.length : Number(filled);
  if (filledItems !== expectedFilled) {
    throw new Error(
      `05-SEED-DATA ${seedKey}: ${filledItems} items read as filled, where the record has ${expectedFilled}`,
    );
  }
  return {
    inspection: {
      originalMicrons: range,
      mechanical: Object.fromEntries(mechanical),
      panels: panelList,
    },
    inspectedOn: ago(days),
    filled: filled === undefined ? null : Number(filled),
    deliberate,
  };
}

function journeyOf(seedKey: string, line: string | undefined) {
  if (line === undefined || line.startsWith("none")) return { milestones: [], offsets: {} };
  const { bare, notes } = withoutNotes(line);
  const offsets: Record<string, number> = {};
  const milestones = bare.split(" → ").map((step) => {
    const [, type = "", place, inside = ""] = read(
      /^([a-z_]+)(?: `([a-z0-9_]+)`)? \(([^)]*)\)/,
      step,
      "a journey step",
    );
    let month: string | null = null;
    let at: string | undefined;
    const given: Record<string, string> = {};
    for (const part of inside.split("; ")) {
      const offset = /^−(\d+)(?:, at `([a-z0-9_]+)`)?$/.exec(part);
      const noted = /^(note|damage) @(\d+)$/.exec(part);
      const brand = /^`([a-z]+)`$/.exec(part);
      if (/^\w{3} \d{4}$/.test(part)) {
        month = monthOf(part);
      } else if (offset) {
        offsets[type] = ago(offset[1] ?? "");
        at = offset[2];
      } else if (brand) {
        given["titleBrand"] = brand[1] ?? "";
      } else if (noted) {
        const text = notes[Number(noted[2])];
        if (text === undefined) throw new Error(`05-SEED-DATA ${seedKey}: a journey note is missing`);
        const [en, ar] = noted[1] === "note" ? ["noteEn", "noteAr"] : ["damageNoteEn", "damageNoteAr"];
        given[en] = text.en;
        given[ar] = text.ar;
      } else if (!JOURNEY_REMARKS.some((remark) => remark.test(part))) {
        throw new Error(`05-SEED-DATA ${seedKey}: a journey step's detail doesn't read: ${part}`);
      }
    }
    const where = place ?? at ?? (AMMAN_MILESTONES.has(type) ? "amman" : undefined);
    if (where === undefined) throw new Error(`05-SEED-DATA ${seedKey}: the ${type} milestone has no place`);
    return { type, place: where, month, ...given };
  });
  return { milestones, offsets };
}

function featuresOf(line: string, packs: ReadonlyMap<string, readonly string[]>): string[] {
  const [packList = "", extras = ""] = firstSentence(line).split(/,? plus /);
  const keys = [
    ...packList.split(", ").flatMap((pack) => {
      const keys = packs.get(pack);
      if (keys === undefined) throw new Error(`05-SEED-DATA: no feature pack ${pack}`);
      return keys;
    }),
    ...Array.from(extras.matchAll(/`([a-z0-9_]+)`/g), ([, each = ""]) => each),
  ];
  const unknown = keys.filter((each) => !FEATURES.has(each));
  if (unknown.length > 0) throw new Error(`05-SEED-DATA: features no catalog has: ${unknown.join(", ")}`);
  return FEATURE_KEYS.filter((each) => keys.includes(each));
}

/** A quoted description's text, or none */
const description = (field: Field | undefined) =>
  field === undefined ? null : (read(/^"(.+)"$/, field.text, "a description")[1] ?? "");

export type SpecCar = {
  /** The record as seed/cars.json holds it, each drawn reading null */
  readonly record: SeedCar;
  /** The VIN the Jordan line gives, which seed-private/vins.json holds */
  readonly vin: string | null;
  /** How many of the 16 items a partial inspection fills */
  readonly filled: number | null;
  /** The panels whose reading the record calls deliberate (BR-08) */
  readonly deliberate: readonly string[];
  /** The EPA's figures, where the running line gives them */
  readonly epa: { readonly lPer100km?: number; readonly kwhPer100km?: number } | null;
};

/** §5.4's and §5.5's records, in order, with §5.2's defaults and §4.1's mileage, under the rules as of now */
export function specCars(seed: string, now: Date): SpecCar[] {
  const schema = seedCarsSchema(now);
  const packs = featurePacks(seed);
  const mileage = new Map(specOverview(seed).map((row) => [row.seedKey, row.mileageKm]));
  return recordTexts(seed).map(({ heading, fields }) => {
    const [, record = "", refCode = ""] = read(/^(S\d\d) · (\S+) · /, heading, "a record heading");
    const seedKey = record.toLowerCase();
    const text = (label: string) => {
      const field = fields.get(label);
      if (field === undefined) throw new Error(`05-SEED-DATA ${record}: no ${label} line`);
      return field.text;
    };
    const identity = identityOf(text("Identity"));
    const jordan = jordanOf(text("Jordan"));
    const dates = datesOf(fields);
    const running = runningOf(fields.get("Running")?.text, identity.fuelType);
    const inspection = inspectionOf(record, fields.get("Inspection"));
    const journey = journeyOf(record, fields.get("Journey")?.text);
    const car = {
      vinPublic: false,
      ...identity,
      ...paintOf(text("Paint")),
      ...jordan.car,
      condition: "used",
      mileageKm: mileage.get(seedKey) ?? null,
      features: featuresOf(text("Features"), packs),
      priceJod: dates.priceJod,
      descriptionAr: description(fields.get("Description AR")),
      descriptionEn: description(fields.get("Description EN")),
      ...running.car,
    };
    const seedOffsets = defined({
      published: dates.published,
      sold: dates.sold,
      priceChanges: dates.priceChanges,
      inspectedOn: inspection?.inspectedOn,
      licenseExpiryMonths: jordan.licenseExpiryMonths,
      milestones: journey.offsets,
    });
    const parsed = parseStrict(schema, [
      defined({
        seedKey,
        refCode,
        status: dates.status,
        platesConfirmed: dates.status !== "draft",
        createdOffset: dates.createdOffset,
        car,
        seedOffsets,
        inspection: inspection?.inspection ?? null,
        journey: journey.milestones,
      }),
    ]);
    const [parsedRecord] = parsed.ok ? parsed.data : [];
    if (!parsed.ok || parsedRecord === undefined) {
      throw new Error(
        `05-SEED-DATA ${record} breaks the seed schema: ${parsed.ok ? "no record" : parsed.problems.join("; ")}`,
      );
    }
    return {
      record: parsedRecord,
      vin: jordan.vin,
      filled: inspection?.filled ?? null,
      deliberate: inspection?.deliberate ?? [],
      epa: running.epa,
    };
  });
}

// §5.3 and SRS §6.4

/** SRS §6.4's makes, each keyed by its English name as slugs write it */
export function specMakes(srs: string) {
  const [, list = ""] = read(/\*\*Makes and models:\*\*[^:]*: (.*?)\. Models cover/, srs, "the SRS's makes");
  return Array.from(list.matchAll(/(?:^|, |and )([A-Z][A-Za-z -]*?) \(([^)]+)\)/g), ([, nameEn = "", nameAr = ""]) => ({
    key: slugify(nameEn),
    nameEn,
    nameAr,
  }));
}

/** §5.3's models, from both its tables, with their aliases as written */
export function specModels(seed: string) {
  return tables(section(seed, "### 5.3 "))
    .flat()
    .map(([key = "", names = "", defaultBodyType = "", aliases = ""]) => {
      const [nameEn, nameAr] = pair(names, "a model's names");
      return {
        key: code(key, "a model key"),
        nameEn,
        nameAr,
        defaultBodyType,
        aliases: aliases === "" ? [] : aliases.split("، "),
      };
    });
}

// §6.2 and §7

/** §6.2's VINs and their decodes, by seed key */
export function specVins(seed: string) {
  const [rows = []] = tables(section(seed, "### 6.2 "));
  return new Map(
    rows.map(([car = "", vin = "", decoded = ""]) => [car.toLowerCase(), { vin: code(vin, "a VIN"), decoded }]),
  );
}

/** §7's places, and the OpenStreetMap object each was read from */
export function specPlaces(seed: string) {
  const [rows = []] = tables(section(seed, "## 7. "));
  return rows.map(([key = "", names = "", countryCode = "", kind = "", coordinates = "", source = ""]) => {
    const [nameEn, nameAr] = pair(names, "a place's names");
    const [, lat = "", lng = ""] = read(/^(-?[\d.]+), (-?[\d.]+)$/, coordinates, "a place's coordinates");
    const [, osm = ""] = read(/^((?:node|way|relation)\/\d+)(?: \(.+\))?$/, source, "a place's source");
    const place = {
      key: code(key, "a place key"),
      nameEn,
      nameAr,
      countryCode,
      kind,
      lat: Number(lat),
      lng: Number(lng),
    };
    return { place, source: { key: place.key, osm, lat: place.lat, lng: place.lng } };
  });
}

// §2

const WEEK = ["sat", "sun", "mon", "tue", "wed", "thu"] as const;

/** One period of opening hours */
const period = (open: string, close: string) => ({ open, close, overnight: false });

/** §2's dealer and its live settings, with the deck's tagline and the SRS's baseline consumptions */
export function specSettings(seed: string, srs: string, tagline: { en: string; ar: string }) {
  const [brandRows = []] = tables(section(seed, "### 2.1 "));
  const rows = new Map(brandRows.map(([field = "", value = ""]) => [field, value]));
  const row = (field: string) => {
    const value = rows.get(field);
    if (value === undefined) throw new Error(`05-SEED-DATA §2.1: no ${field} row`);
    return value;
  };
  const [brandNameEn, brandNameAr] = pair(row("`brand_name_en` / `brand_name_ar`"), "the brand names");
  const phone = read(/^`(\+\d+)`/, row("`whatsapp_e164` / `phone_e164`"), "the phone")[1] ?? "";
  const [, lat = "", lng = ""] = read(/^(-?[\d.]+), (-?[\d.]+) /, row("Coordinates"), "the showroom's coordinates");
  read(/^None\b/, row("Social links"), "the social links");

  const hoursText = section(seed, "### 2.2 ");
  const [, open = "", close = "", fridayOpen = "", fridayClose = ""] = read(
    /\*\*Weekly:\*\* Saturday to Thursday (\d\d:\d\d) to (\d\d:\d\d); Friday (\d\d:\d\d) to (\d\d:\d\d)/,
    hoursText,
    "the weekly hours",
  );
  const [, startDay = "", startMonth = "", endDay = "", endMonth = "", year = "", ...times] = read(
    /\*\*Ramadan \d{4} schedule:\*\* expected (\d+) (\w{3}) to (\d+) (\w{3}) (\d{4}), Saturday to Thursday (\d\d:\d\d) to (\d\d:\d\d) and (\d\d:\d\d) to (\d\d:\d\d), Friday closed/,
    hoursText,
    "the Ramadan hours",
  );
  const [firstOpen = "", firstClose = "", secondOpen = "", secondClose = ""] = times;
  const [holidays = []] = tables(hoursText);
  const closures = holidays.flatMap(([names = "", dates = ""]) => {
    const [noteEn, noteAr] = pair(names, "a holiday's names");
    const [, from = "", to, month = "", closedYear = ""] = read(
      /^(\d+)(?: to (\d+))? (\w{3}) (\d{4})$/,
      dates,
      "a holiday's dates",
    );
    return Array.from({ length: Number(to ?? from) - Number(from) + 1 }, (_, index) => ({
      date: dateOf(String(Number(from) + index), month, closedYear),
      note_ar: noteAr,
      note_en: noteEn,
    }));
  });

  const [priceRows = []] = tables(section(seed, "### 2.3 "));
  const prices = new Map(priceRows.map(([field = "", value = ""]) => [field.replaceAll("`", ""), value]));
  const unitPrice = (field: string) =>
    Number(read(/^(\d+\.\d+) JOD\//, prices.get(field) ?? "", `the ${field} price`)[1]);
  const [, baselines = ""] = read(
    /^\| baseline_l_per_100km \|[^\n]*\| ([a-z]+ [\d.]+(?:, [a-z]+ [\d.]+)*) \|/m,
    srs,
    "the SRS's baselines",
  );

  const showcase = section(seed, "### 2.4 ");
  const [, low = "", high = ""] = read(/mileage bands ([\d,]+) \/ ([\d,]+) km/, showcase, "the mileage bands");
  const [, factoryMax = "", refinishMax = ""] = read(/micron bands (\d+) \/ (\d+)/, showcase, "the micron bands");
  return {
    dealer: {
      slug: code(read(/^`[^`]+`/, row("`slug` (`DEALER_SLUG`)"), "the slug")[0], "the slug"),
      refPrefix: read(/^`([A-Z]{2})`/, row("Ref prefix"), "the reference prefix")[1] ?? "",
    },
    brand: {
      brandNameAr,
      brandNameEn,
      taglineAr: tagline.ar,
      taglineEn: tagline.en,
      storyAr: row("Story AR"),
      storyEn: row("Story EN"),
      accentPreset: code(row("`accent_preset`"), "the accent"),
    },
    contact: {
      whatsappE164: phone,
      phoneE164: phone,
      email: read(/^`([^`]+)`/, row("Email"), "the email")[1] ?? "",
      addressAr: row("Address AR"),
      addressEn: row("Address EN"),
      lat: Number(lat),
      lng: Number(lng),
      social: {},
    },
    hours: {
      hours: {
        ...Object.fromEntries(WEEK.map((day) => [day, [period(open, close)]])),
        fri: [period(fridayOpen, fridayClose)],
      },
      ramadan: {
        start: dateOf(startDay, startMonth, year),
        end: dateOf(endDay, endMonth, year),
        hours: {
          ...Object.fromEntries(
            WEEK.map((day) => [day, [period(firstOpen, firstClose), period(secondOpen, secondClose)]]),
          ),
          fri: "closed",
        },
      },
      closures: closures.sort((first, second) => (first.date < second.date ? -1 : 1)),
    },
    prices: {
      fuelPrice90: unitPrice("fuel_price_90"),
      fuelPrice95: unitPrice("fuel_price_95"),
      fuelPrice98: unitPrice("fuel_price_98"),
      fuelPriceDiesel: unitPrice("fuel_price_diesel"),
      elecHomeOffpeakKwh: unitPrice("elec_home_offpeak_kwh"),
      elecHomePeakKwh: unitPrice("elec_home_peak_kwh"),
      elecPublicKwh: unitPrice("elec_public_kwh"),
      baselineLPer100km: Object.fromEntries(
        baselines.split(", ").map((each) => {
          const [body = "", litres = ""] = each.split(" ");
          return [body, Number(litres)];
        }),
      ),
    },
    pricesUpdatedAt: read(/^(\d{4}-\d{2}-\d{2}) /, prices.get("prices_updated_at") ?? "", "the prices' date")[1] ?? "",
    showcase: {
      heroCar: seedKeys(read(/`hero_car_id` is (S\d\d)/, showcase, "the hero")[0])[0] ?? null,
      featuredCars: seedKeys(read(/`featured_car_ids`: (.+)\.$/m, showcase, "the featured cars")[1] ?? ""),
    },
    advanced: {
      soldVisibleDays: Number(read(/sold visibility: (\d+) days/, showcase, "the sold visibility")[1]),
      mileageBands: { low: figure(low), high: figure(high) },
      micronBands: { factoryMax: Number(factoryMax), refinishMax: Number(refinishMax) },
    },
  };
}
