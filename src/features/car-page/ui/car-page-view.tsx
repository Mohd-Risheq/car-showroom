import { getTranslations } from "next-intl/server";
import type { PublicCarDTO } from "@/lib/db/public-dto";
import { getAppLocale, getUnitNames } from "@/lib/i18n/server";
import { CarActionBar } from "./car-action-bar";
import { CarFacts } from "./car-facts";
import { CarGallery } from "./car-gallery";
import { CarShare } from "./car-share";
import { EvidenceStrip } from "./evidence-strip";
import { CarSections } from "./sections";
import { TitleBlock } from "./title-block";

// SCR-03's car page (FR-09, DESIGN §7.2.3), fed by the public car and the page's address alone, so
// the demo's route can show its own cars in it under its own addresses (FR-45.4a). Region A, the
// stage, splits from 1024 px: the gallery's column at the start, 7 of 12, which starts 32 px under
// the header and holds still there while the facts' column at the end, 5 of 12, scrolls past
// (SCR-03), except while the English offer shows (globals.css, D-049). The gallery's column is a
// container, whose width sets the stage's height (--stage-height). Phones stack them, the gallery
// first, its photo flush under the header (photo-gallery.tsx). The car's sections follow, a
// section's gap apart, in FR-09's order (sections.tsx), then Share ends the page, closer to the last
// of them than a section's gap, so it reads as the page's end rather than the footer's start
// (Region J); from 1440 px its row starts where the reading sections' words do. The page's lead
// stands a step above the site's (--car-lead-size). Below 1024 px the action bar holds the bottom
// of the screen (FR-02.2).

type CarPageViewProps = {
  car: PublicCarDTO;
  /** The page's canonical address, which Share sends (FR-09.11) */
  url: string;
};

export async function CarPageView({ car, url }: CarPageViewProps) {
  const [locale, names, t] = await Promise.all([getAppLocale(), getUnitNames(), getTranslations()]);
  return (
    <article className="mx-auto flex max-w-content flex-col px-band pb-12 [--lead-size:var(--car-lead-size)] md:pb-24 lg:pt-8">
      <div className="flex flex-col gap-section">
        <div className="grid gap-y-6 lg:grid-cols-12 lg:gap-x-gutter">
          <div data-gallery-column className="lg:sticky lg:top-(--stage-top) lg:col-span-7 lg:self-start lg:@container">
            <CarGallery car={car} locale={locale} t={t} />
          </div>
          <div className="flex flex-col gap-10 lg:col-span-5 lg:gap-12">
            <TitleBlock car={car} locale={locale} names={names} url={url} t={t} />
            <CarFacts car={car} locale={locale} names={names} t={t} />
            <EvidenceStrip car={car} t={t} />
          </div>
        </div>
        <CarSections car={car} locale={locale} names={names} t={t} />
      </div>
      <div className="mt-16 xl:grid xl:grid-cols-12 xl:gap-x-gutter">
        <div className="flex flex-wrap gap-2 xl:col-span-8 xl:col-start-5">
          <CarShare car={car} locale={locale} url={url} t={t} variant="secondary" />
        </div>
      </div>
      <CarActionBar car={car} locale={locale} names={names} t={t} />
    </article>
  );
}
