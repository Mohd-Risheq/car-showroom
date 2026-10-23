import type { ReactNode } from "react";
import type { AppLocale } from "@/lib/i18n/routing";
import { LanguageLink } from "./language-link";

type SpecimenPageProps = {
  title: string;
  locale: AppLocale;
  /** The page's path after the locale, for the link to the other language */
  path: string;
  children: ReactNode;
};

/** A token specimen: the development chrome, then its sections */
export function SpecimenPage({ title, locale, path, children }: SpecimenPageProps) {
  return (
    <main className="mx-auto grid max-w-content grid-cols-[minmax(0,1fr)] gap-16 px-page py-12">
      <header
        lang="en"
        dir="ltr"
        className="flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-sm text-muted"
      >
        <h1 className="text-ink">{title}</h1>
        <LanguageLink locale={locale} path={path} className="text-accent underline underline-offset-4" />
      </header>
      {children}
    </main>
  );
}
