import { CSPProvider } from "@base-ui/react/csp-provider";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { directionOf, routing } from "@/i18n/routing";
import { NO_ICON_YET } from "@/lib/metadata";
import { fontVariables } from "@/styles/fonts";
import "@/styles/globals.css";

// Root layout 2 of 2: the dealer workspace renders per request and may block, with no
// <Suspense> above it (SRS §11.5 rule 13)
export const instant = false;

export const metadata: Metadata = { icons: NO_ICON_YET };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function DealerRootLayout({ children }: LayoutProps<"/[locale]/dealer">) {
  // proxy.ts sets a fresh nonce on every dealer request (SRS §12.5). Next.js puts it on its own
  // scripts; Base UI needs it for the inline scripts and styles some of its parts render.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const locale = await getLocale();

  return (
    <html lang={locale} dir={directionOf(locale)} className={fontVariables}>
      <body>
        <CSPProvider nonce={nonce}>{children}</CSPProvider>
      </body>
    </html>
  );
}
