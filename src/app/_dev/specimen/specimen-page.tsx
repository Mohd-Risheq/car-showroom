import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { type AppLocale, directionOf } from "@/i18n/routing";
import { SPECIMEN_COPY } from "./copy";
import { LanguageLink } from "./language-link";

type SpecimenPageProps = {
  title: string;
  locale: AppLocale;
  /** The page's path after the locale, for the link to the other language */
  path: string;
  children: ReactNode;
};

/**
 * A token specimen: the development chrome, then its sections. Until T-14 mounts the Toaster in the
 * root layouts with its catalog label, the specimen mounts its own.
 */
export function SpecimenPage({ title, locale, path, children }: SpecimenPageProps) {
  return (
    <>
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
      <Toaster dir={directionOf(locale)} label={SPECIMEN_COPY[locale].toasts} />
    </>
  );
}
