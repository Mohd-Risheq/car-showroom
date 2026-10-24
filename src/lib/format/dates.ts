import { INTL_LOCALE, TIME_ZONE } from "@/lib/i18n/intl-locale";
import type { AppLocale } from "@/lib/i18n/locales";

// BR-03: the Gregorian calendar in each language's formatting locale, so Arabic takes Levantine month
// names with Western digits, "18 تشرين الأول 2026", and English "18 Oct 2026". A moment shows as
// Amman sees it. A calendar date, which Postgres stores with no time or zone, shows as stored.
//
// Each format is assembled from formatToParts, with the parts in a fixed order joined by spaces,
// rather than taken from format(): WebKit puts "،" after an Arabic month (D-040), and the server and
// every browser must write the same text, or hydration fails.
//
// A date is text in its language, so it reads in that language's direction, never in a
// left-to-right isolate as a number does (DESIGN §9.4): in one, "18 تشرين الأول 2026" reads as
// month, year, day.

/** A moment, or a calendar date as Postgres's date type gives it: 2026-10-18 */
export type DateValue = Date | string;

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

// English shortens the month and Arabic spells it out, as BR-03's examples do
const MONTH = { ar: "long", en: "short" } as const satisfies Record<AppLocale, Intl.DateTimeFormatOptions["month"]>;

// Building a formatter is slow, so each locale, zone and style keeps one
const formats = new Map<string, Intl.DateTimeFormat>();

/** The instant to format and the zone to read it in */
function instantOf(value: DateValue): { instant: Date; timeZone: string } {
  if (typeof value !== "string") {
    if (Number.isNaN(value.getTime())) throw new RangeError("Can't format an invalid date");
    return { instant: value, timeZone: TIME_ZONE };
  }
  if (CALENDAR_DATE.test(value)) {
    const instant = new Date(`${value}T00:00:00Z`);
    // The engine reads 2026-02-30 as 2 March, so only a real date comes back as written
    if (!Number.isNaN(instant.getTime()) && instant.toISOString().startsWith(value)) {
      return { instant, timeZone: "UTC" };
    }
  }
  throw new RangeError(`${value} is not a calendar date (YYYY-MM-DD)`);
}

/** The value's parts of these types, in this order, joined by the separator */
function assemble(
  value: DateValue,
  locale: AppLocale,
  options: Intl.DateTimeFormatOptions,
  order: Intl.DateTimeFormatPartTypes[],
  separator: string,
): string {
  const { instant, timeZone } = instantOf(value);
  const key = `${locale} ${timeZone} ${JSON.stringify(options)}`;
  let formatter = formats.get(key);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(INTL_LOCALE[locale], { ...options, timeZone });
    formats.set(key, formatter);
  }
  const parts = formatter.formatToParts(instant);
  return order
    .map((type) => {
      const part = parts.find((candidate) => candidate.type === type);
      if (part === undefined) throw new Error(`${INTL_LOCALE[locale]} wrote no ${type} for ${JSON.stringify(options)}`);
      return part.value;
    })
    .join(separator);
}

/** A day (BR-03): 18 Oct 2026, or 18 تشرين الأول 2026 */
export function formatDate(value: DateValue, locale: AppLocale): string {
  return assemble(
    value,
    locale,
    { day: "numeric", month: MONTH[locale], year: "numeric" },
    ["day", "month", "year"],
    " ",
  );
}

/** A month and year, as the Journey dates its places: Mar 2024, or آذار 2024 */
export function formatMonthYear(value: DateValue, locale: AppLocale): string {
  return assemble(value, locale, { month: MONTH[locale], year: "numeric" }, ["month", "year"], " ");
}

/** A moment's time of day in Amman, on the 24-hour clock in both languages (DESIGN §9.5): 09:30, 17:00 */
export function formatTime(value: Date, locale: AppLocale): string {
  // h23, as the Arabic locale's own clock is 12-hour ("8:30 م", D-040)
  return assemble(value, locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, ["hour", "minute"], ":");
}

/** A length of time in minutes and seconds, as an audio player shows it (DESIGN §9.5): 0:12, 3:05 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError(`Can't show ${seconds} s as a duration`);
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
