import type { ReactNode } from "react";
import type { PublicCarDTO } from "@/lib/db/public-dto";
import type { UnitNames } from "@/lib/format/units";
import { hasText } from "@/lib/i18n/bilingual";
import type { AppLocale } from "@/lib/i18n/locales";
import { CarDescription } from "./description";
import { CarFeatures } from "./features";
import type { CarPageKey, Translate } from "./translate";

// The car page's sections under the stage (FR-09, DESIGN §7.2.3), in FR-09's order: the list each
// section's task adds its own entry to, in its place (BUILD-PLAN §5.1). Each section sits in a
// frame with its anchor, for the links on the page that go to it, and its heading (DESIGN §8.1).
// From 1440 px a reading section's heading stands beside what it shows, in the first 4 of 12
// columns, on the baseline of its first line (D-049). The frame is a plain section, not a landmark,
// so the page's landmarks stay §8.1's. A car without what a section shows has no frame for it at
// all (§7.2.3). The frames render on the server, with no script: a section with an interactive part
// loads it near the screen through nearViewport, which gives the section its line if that part
// fails in the browser.

/** What a section renders from: the car, and the page's language, unit names and copy */
export type SectionProps = { car: PublicCarDTO; locale: AppLocale; names: UnitNames; t: Translate };

type CarSection = {
  /** The section's anchor */
  id: string;
  /** Its heading */
  title: CarPageKey;
  /** Whether the car has what the section shows */
  has: (car: PublicCarDTO) => boolean;
  /** Whether it is a reading section, whose heading stands beside what it shows from 1440 px */
  side: boolean;
  /** What the section shows under its heading */
  Content: (props: SectionProps) => ReactNode;
};

export const CAR_SECTIONS: readonly CarSection[] = [
  {
    id: "features",
    title: "car.features.title",
    has: (car) => car.features.length > 0,
    side: true,
    Content: CarFeatures,
  },
  // In either language, as the page shows the other's where its own is missing (BR-28)
  {
    id: "description",
    title: "car.description.title",
    has: (car) => hasText(car.description),
    side: true,
    Content: CarDescription,
  },
];

type SectionFrameProps = {
  id: string;
  title: string;
  /** Whether its heading stands beside what it shows from 1440 px, as a reading section's does */
  side?: boolean;
  children: ReactNode;
};

/** A section's frame: its anchor, its heading at the subhead step, and what it shows under it */
export function SectionFrame({ id, title, side = false, children }: SectionFrameProps) {
  if (!side) {
    return (
      <section id={id} className="flex flex-col gap-8">
        <h2 className="type-subhead">{title}</h2>
        {children}
      </section>
    );
  }
  return (
    <section id={id} className="flex flex-col gap-8 xl:grid xl:grid-cols-12 xl:items-baseline xl:gap-x-gutter">
      <h2 className="type-subhead xl:col-span-4">{title}</h2>
      <div className="xl:col-span-8">{children}</div>
    </section>
  );
}

/** The sections the car has, each in its frame, in FR-09's order */
export function CarSections(props: SectionProps) {
  return CAR_SECTIONS.filter(({ has }) => has(props.car)).map(({ id, title, side, Content }) => (
    <SectionFrame key={id} id={id} title={props.t(title)} side={side}>
      <Content {...props} />
    </SectionFrame>
  ));
}
