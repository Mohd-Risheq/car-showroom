import { getDealerId } from "@/features/settings/server/dealer-id";
import { getSettings } from "@/features/settings/server/public-settings";
import { getAppLocale } from "@/lib/i18n/server";

// The home page (FR-04) is built in T-25. Until then it holds its heading at the head step DESIGN
// §7.2.1 sets (D-038): the dealer's tagline (DESIGN §8.1), from the settings, or the dealer's name
// where it has none in the page's language. Which store the tagline comes from is T-25's (D-047).
export default async function HomePage() {
  const locale = await getAppLocale();
  const settings = await getSettings(await getDealerId());
  return (
    <div className="mx-auto max-w-content px-band py-12 md:py-20">
      <h1 className="type-head">{settings.tagline[locale] ?? settings.brandName[locale]}</h1>
    </div>
  );
}
