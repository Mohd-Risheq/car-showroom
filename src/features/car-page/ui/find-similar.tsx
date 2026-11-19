import Link from "next/link";
import { buttonClasses } from "@/components/ui/button-classes";
import { cn } from "@/lib/class-names";
import type { PublicCarDTO } from "@/lib/db/public-dto";
import type { AppLocale } from "@/lib/i18n/locales";
import { similarCarsPath } from "../domain/similar";
import type { Translate } from "./translate";

// FR-09.9: a sold car's lead action, Find a similar car, which opens the inventory on cars of its
// body type within a fifth of its price. The title block holds it from 1024 px, the action bar below.

type FindSimilarProps = {
  car: Pick<PublicCarDTO, "bodyType" | "priceJod">;
  locale: AppLocale;
  t: Translate;
  className?: string;
};

export function FindSimilar({ car, locale, t, className }: FindSimilarProps) {
  return (
    <Link
      href={similarCarsPath(locale, car.bodyType, car.priceJod)}
      className={cn(buttonClasses({ variant: "primary" }), className)}
    >
      {t("car.findSimilar")}
    </Link>
  );
}
