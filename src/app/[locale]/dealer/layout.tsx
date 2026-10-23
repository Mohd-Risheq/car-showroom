import { CSPProvider } from "@base-ui/react/csp-provider";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { DirectionProvider } from "@/components/ui/direction-provider";
import { Toaster } from "@/components/ui/toaster";
import { WorkspaceTheme } from "@/components/ui/workspace-theme";
import { directionOf, routing } from "@/lib/i18n/routing";
import { getAppLocale } from "@/lib/i18n/server";
import { NO_ICON_YET } from "@/lib/metadata";
import { fontVariables } from "@/styles/fonts";
import { THEME_COLOR } from "@/styles/theme-color";
import "@/styles/globals.css";

// Root layout 2 of 2: the dealer workspace renders per request and may block, with no
// <Suspense> above it (SRS §11.5 rule 13)
export const instant = false;

export const metadata: Metadata = { icons: NO_ICON_YET };

// Daylight until the dealer's stored theme says otherwise (DESIGN §3.2)
export const viewport: Viewport = { themeColor: THEME_COLOR.daylight, colorScheme: "light" };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function DealerRootLayout({ children }: LayoutProps<"/[locale]/dealer">) {
  // proxy.ts sets a fresh nonce on every dealer request (SRS §12.5). Next.js puts it on its own
  // scripts; Base UI and next-themes need it for the inline scripts and styles they render.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const locale = await getAppLocale();
  const dir = directionOf(locale);
  const t = await getTranslations("common");

  // data-theme starts as Daylight, so the page is right without JavaScript, and next-themes'
  // script swaps in a stored choice before the first paint. React leaves that change alone.
  return (
    <html lang={locale} dir={dir} data-theme="daylight" className={fontVariables} suppressHydrationWarning>
      <body>
        <CSPProvider nonce={nonce}>
          <WorkspaceTheme nonce={nonce}>
            <DirectionProvider dir={dir}>
              {children}
              <Toaster dir={dir} label={t("notifications")} />
            </DirectionProvider>
          </WorkspaceTheme>
        </CSPProvider>
      </body>
    </html>
  );
}
