import { textIn } from "@/lib/i18n/bilingual";
import { directionOf } from "@/lib/i18n/locales";
import type { SectionProps } from "./sections";

// Region H (DESIGN §7.2.3, FR-09): the dealer's description in a reading column, in the page's
// language, or else in the other one with its language marked and a label saying so, as there is no
// machine translation (BR-28). The dealer's line breaks stay.

export function CarDescription({ car, locale, t }: SectionProps) {
  const text = textIn(car.description, locale);
  // The section shows only for a car whose dealer wrote one (FR-09's edge cases)
  if (text === null) return null;
  return (
    <div className="flex flex-col gap-2">
      {text.lang === locale ? null : (
        <p className="type-small text-muted">
          {t(text.lang === "ar" ? "car.description.onlyArabic" : "car.description.onlyEnglish")}
        </p>
      )}
      <p lang={text.lang} dir={directionOf(text.lang)} className="max-w-measure type-body whitespace-pre-line">
        {text.text}
      </p>
    </div>
  );
}
