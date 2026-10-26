import { normalizeDigits } from "../../../lib/i18n/normalize.ts";
import { isRefCode } from "./ref-code.ts";

// BR-16: a car's slug is {year}-{make}-{model}-{trim?}-{ref}, lowercase ASCII, words joined by
// hyphens and transliterated from the English names. The seed's examples set the details: letters
// lose their accents, Arabic-Indic and Persian digits are read as Western ones, characters between
// words become one hyphen, and the rest are dropped ("ID.4" gives id4, "Crozz Pure+" gives
// crozz-pure). The reference keeps the slug unique per dealer, so a draft that has nothing else yet
// (API-10) is its reference alone. It imports other modules by their relative .ts paths, so the
// seed scripts can load it under plain Node.

/** The length of car.slug */
export const SLUG_MAX_LENGTH = 160;

export type SlugParts = {
  readonly modelYear: number | null;
  readonly makeNameEn: string | null;
  readonly modelNameEn: string | null;
  readonly trim: string | null;
  readonly refCode: string;
};

const MARKS = /\p{M}/gu;
// Spaces, dashes, slashes and underscores part words
const SEPARATORS = /[\s\p{Pd}/_]+/gu;
const NOT_SLUG = /[^a-z0-9-]/g;
const HYPHENS = /-{2,}/g;
const EDGE_HYPHENS = /^-|-$/g;

/** Text as slug words: lowercase ASCII letters and digits joined by single hyphens, maybe "" */
export function slugify(text: string): string {
  return normalizeDigits(text)
    .normalize("NFKD")
    .replace(MARKS, "")
    .toLowerCase()
    .replace(SEPARATORS, "-")
    .replace(NOT_SLUG, "")
    .replace(HYPHENS, "-")
    .replace(EDGE_HYPHENS, "");
}

/** The longest start of the slug words that fits the room, ending at a word unless one word is too long */
function fit(words: string, room: number): string {
  if (words.length <= room) return words;
  const boundary = words.lastIndexOf("-", room);
  return boundary > 0 ? words.slice(0, boundary) : words.slice(0, room);
}

/** BR-16: the car's slug, at most SLUG_MAX_LENGTH characters with the reference always whole */
export function carSlug({ modelYear, makeNameEn, modelNameEn, trim, refCode }: SlugParts): string {
  if (!isRefCode(refCode)) throw new RangeError(`Not a reference code: ${JSON.stringify(refCode)}`);
  const ref = slugify(refCode);
  const name = [modelYear === null ? null : String(modelYear), makeNameEn, modelNameEn, trim]
    .map((part) => (part === null ? "" : slugify(part)))
    .filter((words) => words !== "")
    .join("-");
  const head = fit(name, SLUG_MAX_LENGTH - ref.length - 1);
  return head === "" ? ref : `${head}-${ref}`;
}
