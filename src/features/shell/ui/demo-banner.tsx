import { getTranslations } from "next-intl/server";
import { HideBannerButton } from "./hide-banner-button";

// FR-02.3 and DESIGN §7.1.1: in demo mode, a 40 px strip above the header saying that the showroom,
// its cars and its prices are examples, in muted words so it reads as a notice rather than the
// page's loudest band. In the document's flow, never fixed, so it covers nothing, and the first
// region a screen reader reaches after the skip link (DESIGN §8.1). Its content keeps to the page's
// width, as the header's does. A visitor can hide it for the session; the root layout's head script
// keeps it hidden on every page after.
export async function DemoBanner() {
  const demo = await getTranslations("demo");
  const common = await getTranslations("common");
  return (
    <section aria-label={demo("bannerLabel")} data-demo-banner className="bg-surface-2 type-small">
      <div className="mx-auto flex min-h-(--banner-height) max-w-content items-center justify-between gap-4 px-band py-1">
        <p className="text-muted">{demo("banner")}</p>
        <HideBannerButton label={common("hide")} />
      </div>
    </section>
  );
}
