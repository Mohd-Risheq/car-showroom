import { getTranslations } from "next-intl/server";
import { NotFoundView } from "@/features/shell/ui/not-found-view";
import type { BodyType } from "@/lib/db/enums";
import { getAppLocale } from "@/lib/i18n/server";
import { CarGoneIntro } from "./car-gone";

// The car page's 404 (FR-09.1, DESIGN §7.2.11): the site's, headed that the car is no longer listed
// and leading to similar cars where the site showed the car. The page renders it on the server from
// its result, and not-found.tsx in the browser from what the page's view noted (car-gone.tsx).

type CarNotFoundViewProps = {
  /** What the page's result knows of a car that was here. not-found.tsx leaves it out */
  gone?: { bodyType: BodyType } | null;
};

export async function CarNotFoundView({ gone }: CarNotFoundViewProps) {
  const locale = await getAppLocale();
  const errors = await getTranslations("errors");
  const car = await getTranslations("car");
  const known = gone === undefined ? {} : { bodyType: gone?.bodyType ?? null };
  const labels = {
    notFound: errors("notFound.title"),
    notFoundBody: errors("notFound.body"),
    carGone: errors("carGone"),
    findSimilar: car("findSimilar"),
  };
  return <NotFoundView intro={<CarGoneIntro {...known} locale={locale} labels={labels} />} />;
}
