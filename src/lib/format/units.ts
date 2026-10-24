import type { Messages } from "next-intl";
import type { AppLocale } from "@/lib/i18n/locales";
import { formatNumber } from "./numbers";

/**
 * The units a number is shown with (DESIGN §9.5), each the copy deck's format.unit.* key: its decimals,
 * as SRS §6 stores the value, and whether a spoken name, format.spoken.*, follows it for screen
 * readers. The unit follows the number after a no-break space (DESIGN §9.4): Quantity writes them in
 * markup, and formatQuantity as text.
 */
export const UNITS = {
  // Car prices in whole dinars (BR-02)
  jod: { decimals: 0, spoken: true },
  // Fuel prices and electricity tariffs, to the fils, as numeric(6,3) stores them
  jodPerLitre: { decimals: 3, spoken: true },
  jodPerKwh: { decimals: 3, spoken: true },
  km: { decimals: 0, spoken: true },
  mm: { decimals: 0, spoken: true },
  // An engine's size in litres, from engine_cc; the wizard's input takes cc
  litre: { decimals: 1, spoken: false },
  cc: { decimals: 0, spoken: false },
  hp: { decimals: 0, spoken: false },
  micron: { decimals: 0, spoken: false },
  // Consumption, as numeric(4,1) stores it
  lPer100Km: { decimals: 1, spoken: true },
  kwhPer100Km: { decimals: 1, spoken: true },
  // Bundle sizes on How it's built, and a file's size
  kb: { decimals: 1, spoken: false },
  mb: { decimals: 1, spoken: false },
} as const satisfies Record<string, { decimals: number; spoken: boolean }>;

export type Unit = keyof typeof UNITS;

/** The units that have a spoken name */
export type SpokenUnit = { [U in Unit]: (typeof UNITS)[U]["spoken"] extends true ? U : never }[Unit];

/**
 * What Quantity needs from the page's language: its locale, and the catalog's format.unit and
 * format.spoken names (getUnitNames). Typed by the catalog, so a unit the catalogs don't name fails
 * the type check where it is shown.
 */
export type UnitNames = { locale: AppLocale } & Pick<Messages["format"], "unit" | "spoken">;

/** The space between a number and its unit, which keeps them on one line (DESIGN §9.4) */
export const NO_BREAK_SPACE = String.fromCodePoint(0xa0);

/** A number as its unit shows it: 14,500 for jod, 1.360 for jodPerLitre, 2.5 for litre */
export function formatAmount(value: number, unit: Unit, locale: AppLocale): string {
  return formatNumber(value, locale, UNITS[unit].decimals);
}

/**
 * A number and its unit as text, where markup can't go, such as a message's {price}, an attribute or
 * a share caption: "14,500 د.أ". The short name by default; spoken, the unit's spoken name where it
 * has one, for text that only screen readers get: "14,500 دينار أردني". Inside text of the other
 * direction, the caller isolates it, as for a number.
 */
export function formatQuantity(
  value: number,
  unit: Unit,
  names: UnitNames,
  name: "short" | "spoken" = "short",
): string {
  const unitName = name === "spoken" && isSpoken(unit) ? names.spoken[unit] : names.unit[unit];
  return `${formatAmount(value, unit, names.locale)}${NO_BREAK_SPACE}${unitName}`;
}

/** Whether a unit is followed by a spoken name */
export function isSpoken(unit: Unit): unit is SpokenUnit {
  return UNITS[unit].spoken;
}
