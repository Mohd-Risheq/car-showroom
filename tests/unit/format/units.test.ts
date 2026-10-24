import { describe, expect, it } from "vitest";
import { formatAmount, formatQuantity, isSpoken, type Unit, type UnitNames, UNITS } from "@/lib/format/units";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";

// Each unit's decimals follow how SRS §6 stores its values, and the units match the catalogs'
// format.unit.* and format.spoken.* keys, which screens write after the number (DESIGN §9.5)

const UNIT_NAMES = Object.keys(UNITS) as Unit[];
const NO_BREAK_SPACE = String.fromCodePoint(0xa0);
const AR: UnitNames = { locale: "ar", unit: ar.format.unit, spoken: ar.format.spoken };
const EN: UnitNames = { locale: "en", unit: en.format.unit, spoken: en.format.spoken };

describe("formatAmount", () => {
  it.each([
    ["jod", 14500, "14,500"],
    ["jodPerLitre", 0.82, "0.820"],
    ["jodPerKwh", 0.108, "0.108"],
    ["km", 63000, "63,000"],
    ["mm", 4600, "4,600"],
    ["litre", 2.487, "2.5"],
    ["cc", 2487, "2,487"],
    ["hp", 203, "203"],
    ["micron", 120, "120"],
    ["lPer100Km", 4.8, "4.8"],
    ["kwhPer100Km", 15, "15.0"],
    ["kb", 152.63, "152.6"],
    ["mb", 1.25, "1.3"],
  ] as const)("writes %s %s as %s in both languages", (unit, value, shown) => {
    expect(formatAmount(value, unit, "ar")).toBe(shown);
    expect(formatAmount(value, unit, "en")).toBe(shown);
  });
});

describe("formatQuantity", () => {
  it("writes the number, a no-break space and the unit's short name, in both languages", () => {
    expect(formatQuantity(14500, "jod", AR)).toBe(`14,500${NO_BREAK_SPACE}د.أ`);
    expect(formatQuantity(14500, "jod", EN)).toBe(`14,500${NO_BREAK_SPACE}JOD`);
    expect(formatQuantity(1.36, "jodPerLitre", EN)).toBe(`1.360${NO_BREAK_SPACE}JOD/L`);
  });

  it("writes the spoken name where a unit has one, and the short name where it hasn't", () => {
    expect(formatQuantity(14500, "jod", AR, "spoken")).toBe(`14,500${NO_BREAK_SPACE}دينار أردني`);
    expect(formatQuantity(84000, "km", EN, "spoken")).toBe(`84,000${NO_BREAK_SPACE}${en.format.spoken.km}`);
    expect(formatQuantity(2.487, "litre", AR, "spoken")).toBe(`2.5${NO_BREAK_SPACE}لتر`);
  });
});

describe("the units", () => {
  it.each([
    ["ar", ar],
    ["en", en],
  ])("are exactly the units the %s catalog names", (_, catalog) => {
    expect(UNIT_NAMES.toSorted()).toStrictEqual(Object.keys(catalog.format.unit).toSorted());
  });

  it.each([
    ["ar", ar],
    ["en", en],
  ])("are spoken exactly where the %s catalog has a spoken name", (_, catalog) => {
    expect(UNIT_NAMES.filter(isSpoken).toSorted()).toStrictEqual(Object.keys(catalog.format.spoken).toSorted());
  });

  // getUnitNames hands the catalog's text to Quantity as written, which is the shown text only
  // while it holds no ICU syntax: no argument, plural number or quote
  it.each([
    ["ar", ar],
    ["en", en],
  ])("have names in the %s catalog that show as written", (_, catalog) => {
    for (const name of [...Object.values(catalog.format.unit), ...Object.values(catalog.format.spoken)]) {
      expect(name).not.toMatch(/[{}#']/);
    }
  });
});
