import type { Metadata, Viewport } from "next";
import { getLocale } from "next-intl/server";
import { DirectionProvider } from "@/components/ui/direction-provider";
import { directionOf, routing } from "@/i18n/routing";
import { NO_ICON_YET } from "@/lib/metadata";
import { fontVariables } from "@/styles/fonts";
import { THEME_COLOR } from "@/styles/theme-color";
import "@/styles/globals.css";

export const metadata: Metadata = { icons: NO_ICON_YET };

// The public site is dark only (DESIGN §3.1)
export const viewport: Viewport = { themeColor: THEME_COLOR.dark, colorScheme: "dark" };

// Root layout 1 of 2: the public site, prerendered per locale (SRS §11.5 rules 8 and 13)
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function PublicRootLayout({ children }: LayoutProps<"/[locale]">) {
  // Resolved from the [locale] root param in src/i18n/request.ts, which 404s unknown locales
  const locale = await getLocale();
  const dir = directionOf(locale);

  return (
    <html lang={locale} dir={dir} className={fontVariables}>
      {/* Text is set in the body step unless a component chooses another (DESIGN §3.3) */}
      <body className="type-body">
        <DirectionProvider dir={dir}>{children}</DirectionProvider>
      </body>
    </html>
  );
}
