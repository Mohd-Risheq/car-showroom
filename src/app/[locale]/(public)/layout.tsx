import { getLocale } from "next-intl/server";
import { directionOf, routing } from "@/i18n/routing";
import { fontVariables } from "@/styles/fonts";
import "@/styles/globals.css";

// Root layout 1 of 2: the public site, prerendered per locale (SRS §11.5 rules 8 and 13)
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function PublicRootLayout({ children }: LayoutProps<"/[locale]">) {
  // Resolved from the [locale] root param in src/i18n/request.ts, which 404s unknown locales
  const locale = await getLocale();

  return (
    <html lang={locale} dir={directionOf(locale)} className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
