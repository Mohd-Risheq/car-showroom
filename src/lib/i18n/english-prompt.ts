import { localeIn } from "./locale-cookie";

/**
 * FR-01.2a and BR-01: an Arabic page offers English while the visitor has stored no choice and the
 * browser's first language is English, en or any en-*. The browser decides, after hydration, so the
 * page stays prerendered.
 */
export function offersEnglish(cookies: string, languages: readonly string[]): boolean {
  return localeIn(cookies) === undefined && languageOf(languages[0]) === "en";
}

/** A language tag's language, or nothing for a tag that isn't one */
function languageOf(tag: string | undefined): string | undefined {
  if (tag === undefined) return undefined;
  try {
    return new Intl.Locale(tag).language;
  } catch {
    return undefined;
  }
}
