import type { Bilingual } from "@/lib/db/public-dto";
import { type AppLocale, otherLocale } from "./locales";

// BR-28: a dealer's text, written in either language or both, shows in the page's language, or in
// the other one when the page's is missing. The caller marks the other language with lang, so a
// screen reader reads it in its own voice, and says so in words where the rule asks for it.

export type LocalizedText = { readonly text: string; readonly lang: AppLocale };

/** The text in the page's language, else in the other one, else null */
export function textIn(text: Bilingual, locale: AppLocale): LocalizedText | null {
  const own = text[locale];
  if (own !== null) return { text: own, lang: locale };
  const other = otherLocale(locale);
  const fallback = text[other];
  return fallback === null ? null : { text: fallback, lang: other };
}
