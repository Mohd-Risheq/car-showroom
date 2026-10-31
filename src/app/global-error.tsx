"use client";

import "@/styles/globals.css";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { GLOBAL_ERROR_COPY } from "@/features/shell/domain/global-error-copy";
import { DEFAULT_LOCALE, directionOf, LOCALES } from "@/lib/i18n/locales";
import { fontVariables } from "@/styles/fonts";

// SCR-11 and DESIGN §7.2.11: the last resort, when a root layout itself fails. It takes the whole
// document's place, so it brings the styles and fonts itself and no catalog: a minimal page in each
// language, the site's default first, whose line heads the page, with the other's as its twin a
// level down (DESIGN §8.1). Its buttons reload the page, as DESIGN §7.2.11 asks: a fresh document
// and fresh scripts, after a root layout broke.

export default function GlobalError() {
  return (
    <html lang={DEFAULT_LOCALE} dir={directionOf(DEFAULT_LOCALE)} className={fontVariables}>
      <body>
        <title>{GLOBAL_ERROR_COPY[DEFAULT_LOCALE].text}</title>
        <main className="mx-auto flex min-h-svh max-w-measure flex-col justify-center gap-10 px-band py-12">
          {LOCALES.map((locale) => {
            const Heading = locale === DEFAULT_LOCALE ? "h1" : "h2";
            return (
              <section key={locale} lang={locale} dir={directionOf(locale)} className="flex flex-col items-start gap-4">
                <Heading className="type-lead">{GLOBAL_ERROR_COPY[locale].text}</Heading>
                <Button variant="primary" icon={<ArrowClockwiseIcon />} onClick={() => window.location.reload()}>
                  {GLOBAL_ERROR_COPY[locale].reload}
                </Button>
              </section>
            );
          })}
        </main>
      </body>
    </html>
  );
}
