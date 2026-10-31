import type { Viewport } from "next";
import { getTranslations } from "next-intl/server";
import { DirectionProvider } from "@/components/ui/direction-provider";
import { Toaster } from "@/components/ui/toaster";
import { DEMO_BANNER_SCRIPT } from "@/features/shell/domain/demo-banner";
import { isDemoMode } from "@/lib/deployment";
import { directionOf, LOCALES } from "@/lib/i18n/locales";
import { getAppLocale } from "@/lib/i18n/server";
import { fontVariables } from "@/styles/fonts";
import { THEME_COLOR } from "@/styles/theme-color";
import { PAGE_VIEWPORT } from "@/styles/viewport";
import "@/styles/globals.css";

// The public site is dark only (DESIGN §3.1)
export const viewport: Viewport = { ...PAGE_VIEWPORT, themeColor: THEME_COLOR.dark, colorScheme: "dark" };

// Root layout 1 of 2: the public site, prerendered per locale (SRS §11.5 rules 8 and 13)
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function PublicRootLayout({ children }: LayoutProps<"/[locale]">) {
  // The [locale] root param, which src/lib/i18n/request.ts checks: an unknown locale is a 404
  const locale = await getAppLocale();
  const dir = directionOf(locale);
  const t = await getTranslations("common");

  // data-scroll-behavior: Next.js jumps to the top of a new page instantly, while in-page jumps glide
  // (FR-02.6). In demo mode the head script hides a banner this session hid before the first paint
  // (FR-02.3), and React leaves the attribute it sets on <html> alone.
  return (
    <html lang={locale} dir={dir} className={fontVariables} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>{isDemoMode() ? <script dangerouslySetInnerHTML={{ __html: DEMO_BANNER_SCRIPT }} /> : null}</head>
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
