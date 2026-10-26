import { TIME_ZONE } from "../i18n/intl-locale.ts";

// The calendar date in Amman (BR-03), for the rules that read today's date: a model year at most
// next year (VR-02), a journey month not in the future (VR-14). The seed scripts load it too, so
// it imports other modules by their relative .ts paths.

const DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  numberingSystem: "latn",
});

/** The date in Amman at an instant, as Postgres's date type writes it: 2026-10-24 */
export function ammanDate(instant: Date): string {
  if (Number.isNaN(instant.getTime())) throw new RangeError("Can't read the date of an invalid instant");
  const parts = DAY.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
