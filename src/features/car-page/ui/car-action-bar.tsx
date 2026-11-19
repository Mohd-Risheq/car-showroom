import { Quantity } from "@/components/ui/quantity";
import { ActionBar } from "@/features/shell/ui/action-bar";
import type { PublicCarDTO } from "@/lib/db/public-dto";
import type { UnitNames } from "@/lib/format/units";
import type { AppLocale } from "@/lib/i18n/locales";
import { FindSimilar } from "./find-similar";
import type { Translate } from "./translate";

// FR-02.2's action bar on the car page, below 1024 px (DESIGN §7.1.1, §5.8): the car's price in
// Martian Mono at the lead step at the start, its unit muted at the body step, with
// car.priceBeforeCustoms beside it while customs aren't paid (BR-45). The note wraps under the
// price when the bar is narrow. A sold car's bar holds its lead action alone, Find a similar car,
// across the bar (FR-09.9): beside the struck price it ran off a 360 px phone, and the title block
// shows the price struck through (D-049). T-23 adds Call and Push to Start for a car on sale.

type CarActionBarProps = {
  car: Pick<PublicCarDTO, "priceJod" | "customsStatus" | "status" | "bodyType">;
  locale: AppLocale;
  names: UnitNames;
  t: Translate;
};

export function CarActionBar({ car, locale, names, t }: CarActionBarProps) {
  if (car.status === "sold") return <ActionBar actions={<FindSimilar car={car} locale={locale} t={t} />} />;
  return (
    <ActionBar
      price={
        <p className="flex flex-wrap items-baseline gap-x-2 type-lead">
          <Quantity value={car.priceJod} unit="jod" names={names} figures unitClassName="text-muted type-body" />
          {car.customsStatus === "not_cleared" ? (
            <span className="type-small text-muted">{t("car.priceBeforeCustoms")}</span>
          ) : null}
        </p>
      }
      actions={null}
    />
  );
}
