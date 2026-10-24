import { INTL_LOCALE } from "@/lib/i18n/intl-locale";
import type { AppLocale } from "@/lib/i18n/locales";

// BR-02: Intl.NumberFormat with each language's formatting locale, so Arabic keeps Western digits
// (ar-JO-u-nu-latn) and both languages group thousands: 14,500.
//
// ICU writes direction marks around a sign in Arabic, "-14,500" and "91%" each with U+200E, and a
// browser's ICU need not agree with the server's. So the marks are dropped, and every engine writes
// the same characters. In their place the caller isolates a number (DESIGN §4.6, §9.4): a
// <bdi dir="ltr"> in markup, in an element with whitespace-nowrap so it never breaks, as Quantity
// does, or isolate() inside a message, which puts a number left to right, as it has no letter.
// Unisolated in Arabic text, a minus would show on the wrong side. A zero never takes a minus,
// though a small negative number rounds to one: "0", not "-0".

// The left-to-right, right-to-left and Arabic letter marks
const DIRECTION_MARKS = new RegExp(`[${String.fromCodePoint(0x200e, 0x200f, 0x061c)}]`, "gu");

// Building a formatter is slow, so each locale and style keeps one
const formats = new Map<string, Intl.NumberFormat>();

function format(value: number, locale: AppLocale, options: Intl.NumberFormatOptions): string {
  if (!Number.isFinite(value)) throw new RangeError(`Can't format ${value} as a number`);
  const key = `${locale} ${JSON.stringify(options)}`;
  let formatter = formats.get(key);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(INTL_LOCALE[locale], { ...options, signDisplay: "negative" });
    formats.set(key, formatter);
  }
  return formatter.format(value).replace(DIRECTION_MARKS, "");
}

/** A number, grouped, with exactly this many decimals (BR-02): 14,500 with none, 1.360 with three */
export function formatNumber(value: number, locale: AppLocale, decimals = 0): string {
  return format(value, locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * A whole percentage shown on its own, such as an open rate in a table: 91 is 91% in both languages
 * (DESIGN §9.5). A message whose {pct} is followed by its own %, such as car.battery, takes
 * formatNumber instead, or the page would show 91%%.
 */
export function formatPercent(percent: number, locale: AppLocale): string {
  return format(percent / 100, locale, { style: "percent", maximumFractionDigits: 0 });
}
