import { normalizeDigits } from "../i18n/normalize.ts";
import { FRACTION, LATITUDE, LITRES_PER_100KM, LONGITUDE, MICRONS, MILEAGE_KM, type Range } from "./bounds.ts";
import { addIssue, type ValidationIssue } from "./issues.ts";
import { z } from "./zod.ts";

// The fields the schemas are built from. Numbers, dates and times may be typed in Arabic-Indic or
// Persian digits, which are read as Western digits before any rule (FR-31.5, SRS §7.1). A value
// sent empty is no value: required where the field needs one, null where orNull allows it.

type NumberRule = { min: number; max: number; issue: ValidationIssue };

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

/** Typed text as the rules read it: trimmed, with Western digits, and nothing as null */
export function typed(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = normalizeDigits(value).trim();
  return text === "" ? null : text;
}

/** A typed number as a number, or the input as it came for z.number to refuse */
function readNumber(value: unknown): unknown {
  const text = typed(value);
  return typeof text === "string" && DECIMAL.test(text) ? Number(text) : text;
}

/** A decimal's parts rounded half away from zero to the scale, as Postgres stores numeric(p, s) */
function roundDecimal([, sign, whole = "", fraction = ""]: RegExpExecArray, scale: number): number {
  // At most 7 whole and 6 decimal digits reach a check that passes, well within a double's 15
  const units = Number(whole + fraction.padEnd(scale, "0").slice(0, scale)) + (fraction.charAt(scale) >= "5" ? 1 : 0);
  const value = units / 10 ** scale;
  return sign === "-" ? -value || 0 : value;
}

/** A typed or sent decimal rounded to the scale, from the text it was written as */
function readDecimal(value: unknown, scale: number): unknown {
  // A number's own text is the shortest that reads back as it, so 7.25 rounds as written. NaN,
  // the infinities and numbers whose text has an exponent, as one under a millionth does, go on as
  // NaN, which z.number refuses.
  const text = typeof value === "number" ? String(value) : typed(value);
  const parts = typeof text === "string" ? DECIMAL.exec(text) : null;
  if (parts === null) return typeof value === "number" ? Number.NaN : text;
  return roundDecimal(parts, scale);
}

/** A whole number from min to max */
export function integer(rule: NumberRule) {
  return z.preprocess(
    readNumber,
    z.number().check((payload) => {
      if (!Number.isInteger(payload.value)) addIssue(payload, { key: "validation.integer" });
      else if (payload.value < rule.min || payload.value > rule.max) addIssue(payload, rule.issue);
    }),
  );
}

/** A decimal from min to max, rounded to the column's scale before its range is checked */
export function decimal(rule: NumberRule & { scale: number }) {
  return z.preprocess(
    (value) => readDecimal(value, rule.scale),
    z.number().check((payload) => {
      if (payload.value < rule.min || payload.value > rule.max) addIssue(payload, rule.issue);
    }),
  );
}

/** One of a few numbers, typed in any digits */
export function oneOf<const Values extends readonly [number, ...number[]]>(values: Values) {
  return z.preprocess(readNumber, z.literal(values));
}

type TextRule = {
  max: number;
  min?: number;
  /** Line breaks and tabs are kept, written as \n */
  multiline?: boolean;
  /** The message for a length out of bounds; validation.maxChars by default */
  issue?: ValidationIssue;
};

// What no text holds: control characters, line and paragraph separators, and half of a surrogate
// pair, which Postgres can't store. A multi-line field keeps line feeds and tabs, and turns every
// other mandatory line break of UAX #14 into a line feed: CR, CRLF, VT, FF, NEL and the separators.
const UNPRINTABLE = /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}]/u;
const UNPRINTABLE_LINES = /[^\P{Cc}\n\t]|[\p{Zl}\p{Zp}\p{Cs}]/u;
const LINE_BREAK = /\r\n?|[\v\f\x85\p{Zl}\p{Zp}]/gu;

/** Typed text, trimmed, with its line breaks as \n where it may have them; nothing is null */
function readText(value: unknown, multiline: boolean): unknown {
  if (typeof value !== "string") return value;
  const text = (multiline ? value.replace(LINE_BREAK, "\n") : value).trim();
  return text === "" ? null : text;
}

/** Text of up to max characters, counted by code point as Postgres counts them (VR-06: printable) */
export function text(rule: TextRule) {
  const lengthIssue = rule.issue ?? { key: "validation.maxChars", values: { max: rule.max } };
  const unprintable = rule.multiline === true ? UNPRINTABLE_LINES : UNPRINTABLE;
  return z.preprocess(
    (value) => readText(value, rule.multiline === true),
    z.string().check((payload) => {
      const length = [...payload.value].length;
      if (unprintable.test(payload.value)) addIssue(payload, { key: "validation.invalid" });
      else if (length > rule.max || length < (rule.min ?? 0)) addIssue(payload, lengthIssue);
    }),
  );
}

/** VR-22: Zod's own pattern, the usual subset of RFC 5322, without quoted names or IP addresses */
export function emailAddress() {
  return text({ max: 254, issue: { key: "validation.email" } }).pipe(z.email({ error: "validation.email" }));
}

// Postgres's date type has no year 0000, which the engine's calendar reads as real
const DATE = /^(?!0000)\d{4}-\d{2}-\d{2}$/;
const MONTH = /^((?!0000)\d{4}-(?:0[1-9]|1[0-2]))(?:-01)?$/;

/** A real calendar date, as Postgres's date type writes it: 2027-01-05 */
export function calendarDate() {
  return z.preprocess(
    typed,
    z.string().check((payload) => {
      const instant = new Date(`${payload.value}T00:00:00Z`);
      // The engine reads 2026-02-30 as 2 March, so only a date that reads back as written is real
      const real =
        DATE.test(payload.value) && !Number.isNaN(instant.getTime()) && instant.toISOString().startsWith(payload.value);
      if (!real) addIssue(payload, { key: "validation.invalid" });
    }),
  );
}

/** A month, 2027-03, stored as its first day, 2027-03-01, as month columns are */
export function calendarMonth() {
  return z.preprocess(
    typed,
    z
      .string()
      .check((payload) => {
        if (!MONTH.test(payload.value)) addIssue(payload, { key: "validation.invalid" });
      })
      .transform((month) => `${month.slice(0, 7)}-01`),
  );
}

/** Whether no item comes twice */
export function distinct(items: readonly unknown[]): boolean {
  return new Set(items).size === items.length;
}

/**
 * A multi-select's choices: each one of the values, each once, from min to max of them. A problem
 * is the whole field's, as a checklist shows one message.
 */
export function choices<const Values extends readonly [string, ...string[]]>(
  values: Values,
  rule: { min: number; max: number },
) {
  const isChoice = (item: unknown): item is Values[number] => values.some((value) => value === item);
  return z
    .array(z.unknown())
    .check((payload) => {
      const items = payload.value;
      if (items.length < rule.min) addIssue(payload, { key: "validation.required" });
      else if (items.length > rule.max || !distinct(items) || !items.every(isChoice)) {
        addIssue(payload, { key: "validation.invalid" });
      }
    })
    .transform((items) => items.filter(isChoice));
}

/** The field, or null for no value: null, or text of nothing but spaces */
export function orNull<Field extends z.ZodType>(field: Field) {
  return z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? null : value), field.nullable());
}

/** A record's id, in lower case as Postgres writes a uuid, so the same id can't pass as two */
export function recordId() {
  return z.uuid().transform((id) => id.toLowerCase());
}

// The rules that more than one schema applies

/** A whole number in the range, under validation.range */
export function between(range: Range) {
  return integer({ ...range, issue: { key: "validation.range", values: range } });
}

// Make and model keys, as the reference data writes them: toyota, toyota-camry
const REFERENCE_KEY = /^[a-z0-9-]+$/;

/** A make's key, as car.make_key holds it */
export function makeKey() {
  return z.string().max(40).regex(REFERENCE_KEY);
}

/** A model's key, as car.model_key holds it */
export function modelKey() {
  return z.string().max(60).regex(REFERENCE_KEY);
}

/** VR-03: whole kilometres */
export function kilometres() {
  return integer({ ...MILEAGE_KM, issue: { key: "validation.km" } });
}

/** VR-10: litres per 100 km, to one decimal */
export function litresPer100km() {
  return decimal({ ...LITRES_PER_100KM, scale: 1, issue: { key: "validation.range", values: LITRES_PER_100KM } });
}

/** VR-12: a paint reading, in whole microns */
export function microns() {
  return integer({ ...MICRONS, issue: { key: "validation.microns" } });
}

/** VR-23: a latitude, to six decimals as numeric(9, 6) holds it */
export function latitude() {
  return decimal({ ...LATITUDE, scale: 6, issue: { key: "validation.coordinates" } });
}

/** VR-23: a longitude, to six decimals */
export function longitude() {
  return decimal({ ...LONGITUDE, scale: 6, issue: { key: "validation.coordinates" } });
}

/** VR-23 on a place: both coordinates or neither, with the message on the one missing */
export function bothCoordinates(payload: z.core.ParsePayload<{ lat: number | null; lng: number | null }>): void {
  const { lat, lng } = payload.value;
  if (lat === null && lng !== null) addIssue(payload, { key: "validation.coordinates" }, ["lat"]);
  if (lng === null && lat !== null) addIssue(payload, { key: "validation.coordinates" }, ["lng"]);
}

/** A point on an image as a fraction of its width or height, to four decimals */
export function fraction() {
  return decimal({ ...FRACTION, scale: 4, issue: { key: "validation.invalid" } });
}
