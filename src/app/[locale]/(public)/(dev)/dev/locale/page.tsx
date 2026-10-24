import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { Quantity } from "@/components/ui/quantity";
import { notFoundOnDeployments } from "@/lib/deployment";
import type { Unit } from "@/lib/format/units";
import { otherLocale } from "@/lib/i18n/locales";
import { getAppLocale, getUnitNames } from "@/lib/i18n/server";
import { DirectionDemos } from "./direction-demos";
import { FormatTable } from "./format-table";
import { SAMPLES } from "./samples";

// T-15: the language switch (FR-01.4) and DESIGN §9.5's formats. Each format is written by the
// server and again by the browser, which tests/e2e/locale.spec.ts compares in every engine, and
// quantities show how screen readers hear their units. Fields, icons and a long word show direction
// (direction-demos.tsx). Arabic pages also show the English prompt to a browser whose first language
// is English (FR-01.2a).

export const metadata: Metadata = { title: "Muftah dev: languages and formats" };

const QUANTITIES: readonly { id: string; value: number; unit: Unit }[] = [
  { id: "price", value: 14500, unit: "jod" },
  { id: "unit-price", value: 1.36, unit: "jodPerLitre" },
  { id: "kilometres", value: 84000, unit: "km" },
  { id: "consumption", value: 6.8, unit: "lPer100Km" },
  { id: "engine", value: 2.5, unit: "litre" },
  { id: "microns", value: 240, unit: "micron" },
];

export default async function LocaleDevPage() {
  notFoundOnDeployments();
  const [locale, names, t] = await Promise.all([getAppLocale(), getUnitNames(), getTranslations("nav")]);

  return (
    <main className="mx-auto grid max-w-content gap-10 px-page py-12">
      <header
        lang="en"
        dir="ltr"
        className="flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-sm text-muted"
      >
        <h1 className="text-ink">Muftah dev: languages and formats (T-15)</h1>
        <LanguageSwitch locale={otherLocale(locale)} className="text-accent underline underline-offset-4">
          {t("language")}
        </LanguageSwitch>
      </header>
      <FormatTable locale={locale} onServer={SAMPLES.map(({ show }) => show(locale))} />
      <ul className="grid gap-2">
        {QUANTITIES.map(({ id, value, unit }) => (
          <li key={id} data-quantity={id}>
            <Quantity value={value} unit={unit} names={names} />
          </li>
        ))}
      </ul>
      <DirectionDemos />
    </main>
  );
}
