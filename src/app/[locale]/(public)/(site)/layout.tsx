import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LocaleOffer } from "@/components/ui/locale-offer";
import { getDealerId } from "@/features/settings/server/dealer-id";
import { getSettings } from "@/features/settings/server/public-settings";
import { DemoBanner } from "@/features/shell/ui/demo-banner";
import { OfflineToast } from "@/features/shell/ui/offline-toast";
import { RouteArrival } from "@/features/shell/ui/route-arrival";
import { ScrollMemory } from "@/features/shell/ui/scroll-memory";
import { ShellStringsProvider } from "@/features/shell/ui/shell-strings";
import { SiteFooter } from "@/features/shell/ui/site-footer";
import { SiteHeader } from "@/features/shell/ui/site-header";
import { SkipLink } from "@/features/shell/ui/skip-link";
import { isDemoMode } from "@/lib/deployment";
import { getAppLocale } from "@/lib/i18n/server";

// The public site's shell (FR-02, DESIGN §7.1.1 and §8.1): every public page sits in it, and the
// development pages don't. In reading order: the skip link, the demo banner in demo mode, the offer
// of the English page on an Arabic one, the header, the page's main and the footer. The banner comes
// before the offer, as FR-02's acceptance has it, where DESIGN §7.1.1 puts the offer first (D-047).

/** Each page's title, "{page} · {dealer}", and Home's own (meta.titleTemplate, meta.home.title) */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  const settings = await getSettings(await getDealerId());
  const meta = await getTranslations("meta");
  const dealer = settings.brandName[locale];
  return {
    title: { template: meta("titleTemplate", { page: "%s", dealer }), default: meta("home.title", { dealer }) },
  };
}

export default async function SiteLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await getAppLocale();
  const settings = await getSettings(await getDealerId());
  const demo = isDemoMode();
  const common = await getTranslations("common");
  const errors = await getTranslations("errors");

  return (
    <ShellStringsProvider value={{ segmentError: errors("segment"), retry: common("retry") }}>
      {/* At least the screen's height, so a short page's footer still meets the bottom */}
      <div className="flex min-h-svh flex-col">
        <SkipLink label={common("skip")} />
        {demo ? <DemoBanner /> : null}
        <LocaleOffer />
        <SiteHeader locale={locale} brandName={settings.brandName} logo={settings.logo} demo={demo} />
        <main id="content" tabIndex={-1} className="flex-1">
          {children}
        </main>
        <SiteFooter locale={locale} settings={settings} demo={demo} />
      </div>
      <RouteArrival />
      <ScrollMemory />
      <OfflineToast message={common("offline")} />
    </ShellStringsProvider>
  );
}
