import { formatDate, formatDuration, formatMonthYear, formatTime } from "@/lib/format/dates";
import { formatNumber, formatPercent } from "@/lib/format/numbers";
import { formatPhone } from "@/lib/format/phone";
import { formatAmount } from "@/lib/format/units";
import type { AppLocale } from "@/lib/i18n/locales";

// 18 October 2026 at 12:00 and at 17:00 in Amman, and at 01:30, while UTC still has the 17th
const NOON = new Date(Date.UTC(2026, 9, 18, 9));
const FIVE_PM = new Date(Date.UTC(2026, 9, 18, 14));
const AFTER_MIDNIGHT = new Date(Date.UTC(2026, 9, 17, 22, 30));

type Sample = {
  id: string;
  show: (locale: AppLocale) => string;
  /** A date, which is text in its language; anything else is a number */
  date?: true;
};

/** DESIGN §9.5's formats, and the edges BR-02 and BR-03 meet, as lib/format writes them */
export const SAMPLES: readonly Sample[] = [
  { id: "price", show: (locale) => formatAmount(14500, "jod", locale) },
  { id: "unit-price", show: (locale) => formatAmount(1.36, "jodPerLitre", locale) },
  { id: "electricity", show: (locale) => formatAmount(0.108, "jodPerKwh", locale) },
  { id: "monthly-cost", show: (locale) => formatNumber(106, locale) },
  { id: "kilometres", show: (locale) => formatAmount(84000, "km", locale) },
  { id: "consumption", show: (locale) => formatAmount(6.8, "lPer100Km", locale) },
  { id: "date", date: true, show: (locale) => formatDate(NOON, locale) },
  { id: "date-after-midnight", date: true, show: (locale) => formatDate(AFTER_MIDNIGHT, locale) },
  { id: "calendar-date", date: true, show: (locale) => formatDate("2026-10-18", locale) },
  { id: "month-year", date: true, show: (locale) => formatMonthYear("2024-03-01", locale) },
  { id: "time", show: (locale) => formatTime(FIVE_PM, locale) },
  { id: "duration", show: () => formatDuration(12) },
  { id: "engine", show: (locale) => formatAmount(2.5, "litre", locale) },
  { id: "power", show: (locale) => formatAmount(203, "hp", locale) },
  { id: "microns", show: (locale) => formatAmount(240, "micron", locale) },
  { id: "dimensions", show: (locale) => formatAmount(4950, "mm", locale) },
  { id: "percent", show: (locale) => formatPercent(91, locale) },
  { id: "negative", show: (locale) => formatNumber(-14500, locale) },
  { id: "phone", show: () => formatPhone("+962791234567") },
];
