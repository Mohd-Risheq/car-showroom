import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { creditsTablesIn } from "@/features/credits/server/credits";
import { CreditsTables } from "@/features/credits/ui/credits-tables";
import { getAppLocale } from "@/lib/i18n/server";

// SCR-14's Credits page (DESIGN §7.2.9): where the site's photos, sounds, data, fonts and software
// come from, with their authors and licences, in tables built when the app is built, under the
// footer's name for the page.

export async function generateMetadata(): Promise<Metadata> {
  const footer = await getTranslations("footer");
  const meta = await getTranslations("meta.credits");
  return { title: footer("credits"), description: meta("description") };
}

export default async function CreditsPage() {
  const locale = await getAppLocale();
  const t = await getTranslations();
  return (
    <div className="mx-auto max-w-content px-band py-12 md:py-20">
      <article className="max-w-measure">
        <h1 className="type-head">{t("footer.credits")}</h1>
        <CreditsTables tables={creditsTablesIn(locale)} t={t} />
      </article>
    </div>
  );
}
