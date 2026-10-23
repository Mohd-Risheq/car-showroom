import type { Metadata, Viewport } from "next";
import { getTranslations } from "next-intl/server";
import { DirectionProvider } from "@/components/ui/direction-provider";
import { Toaster } from "@/components/ui/toaster";
import { directionOf, routing } from "@/lib/i18n/routing";
import { getAppLocale } from "@/lib/i18n/server";
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
  // The [locale] root param, which src/lib/i18n/request.ts checks: an unknown locale is a 404
  const locale = await getAppLocale();
  const dir = directionOf(locale);
  const t = await getTranslations("common");

  return (
    <html lang={locale} dir={dir} className={fontVariables}>
      {/* Text is set in the body step unless a component chooses another (DESIGN §3.3) */}
      <body className="type-body">
        <DirectionProvider dir={dir}>
          {children}
          <Toaster dir={dir} label={t("notifications")} />
        </DirectionProvider>
      </body>
    </html>
  );
}
