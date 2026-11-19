import type { Bilingual } from "@/lib/db/public-dto";
import { type AppLocale, otherLocale } from "./locales";

// BR-28: a dealer's text, written in either language or both, shows in the page's language, or in
// the other one when the page's is missing. The caller marks the other language with lang, so a
// screen reader reads it in its own voice, and says so in words where the rule asks for it. Blank
// text counts as unwritten, though the validators already store it as null.

export type LocalizedText = { readonly text: string; readonly lang: AppLocale };

/** Whether there is text, not nothing nor blank space */
export const isWritten = (text: string | null | undefined): text is string => text != null && text.trim() !== "";

/** The text in the page's language, else in the other one, else null */
export function textIn(text: Bilingual, locale: AppLocale): LocalizedText | null {
  for (const lang of [locale, otherLocale(locale)]) {
    const written = text[lang];
    if (isWritten(written)) return { text: written, lang };
  }
  return null;
}

/** Whether the dealer wrote the text in either language */
export function hasText(text: Bilingual): boolean {
  return isWritten(text.ar) || isWritten(text.en);
}
