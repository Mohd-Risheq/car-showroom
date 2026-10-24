import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { type AppLocale, otherLocale } from "@/lib/i18n/locales";

type SpecimenPageProps = {
  title: string;
  locale: AppLocale;
  children: ReactNode;
};

/** A token specimen: the development chrome, then its sections */
export async function SpecimenPage({ title, locale, children }: SpecimenPageProps) {
  const t = await getTranslations("nav");

  return (
    <main className="mx-auto grid max-w-content grid-cols-[minmax(0,1fr)] gap-16 px-page py-12">
      <header
        lang="en"
        dir="ltr"
        className="flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-sm text-muted"
      >
        <h1 className="text-ink">{title}</h1>
        <LanguageSwitch locale={otherLocale(locale)} className="text-accent underline underline-offset-4">
          {t("language")}
        </LanguageSwitch>
      </header>
      {children}
    </main>
  );
}
