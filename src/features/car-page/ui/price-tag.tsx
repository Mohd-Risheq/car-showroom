import { FILLED_CHIP } from "@/components/ui/chip-classes";
import { Quantity } from "@/components/ui/quantity";
import { cn } from "@/lib/class-names";
import type { PublicCarDTO, PublicPriceDrop } from "@/lib/db/public-dto";
import { formatDate } from "@/lib/format/dates";
import { formatQuantity, type UnitNames } from "@/lib/format/units";
import type { AppLocale } from "@/lib/i18n/locales";
import type { Translate } from "./translate";

// DESIGN §6.3's PriceTag: the price, static from the first paint (FR-12), its figures in Martian
// Mono at the subhead step, the page's headline number, and its unit muted at the body step on
// their baseline, all muted once the car is sold and its figures struck through (DESIGN §7.2.3).
// The strike is theirs alone: one line can't cross figures and a unit of two sizes, and Chromium
// drew a strike of the whole price in three pieces at three heights (D-049).
// car.priceBeforeCustoms sits under it as visible text while customs aren't paid (BR-45), and a
// drop in the last 30 days is noted with the old price and its day (BR-05), with the cards' Price
// dropped badge beside the price for its first 14 days (FR-09, the owner, 2026-11-02).

type PriceTagProps = {
  car: Pick<PublicCarDTO, "priceJod" | "priceDrop" | "customsStatus" | "status">;
  locale: AppLocale;
  names: UnitNames;
  t: Translate;
  className?: string;
};

export function PriceTag({ car, locale, names, t, className }: PriceTagProps) {
  const sold = car.status === "sold";
  const price = (
    <Quantity
      value={car.priceJod}
      unit="jod"
      names={names}
      figures
      unitClassName="text-muted type-body"
      {...(sold ? { amountClassName: "line-through decoration-from-font" } : {})}
    />
  );
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 type-subhead">
        {sold ? <s className="text-muted no-underline">{price}</s> : price}
        {car.priceDrop?.badge === true ? (
          <span className={cn(FILLED_CHIP, "type-small")}>{t("card.priceDropped")}</span>
        ) : null}
      </p>
      {car.customsStatus === "not_cleared" ? (
        <p className="type-small text-muted">{t("car.priceBeforeCustoms")}</p>
      ) : null}
      {car.priceDrop === null ? null : <PriceDropNote drop={car.priceDrop} locale={locale} names={names} t={t} />}
    </div>
  );
}

/**
 * "Price reduced from {old} on {date}". A message's {old} is text, where Quantity's markup can't go,
 * so screen readers get the sentence again with the unit's spoken name (DESIGN §9.5).
 */
function PriceDropNote({ drop, locale, names, t }: { drop: PublicPriceDrop } & Omit<PriceTagProps, "car">) {
  const date = formatDate(new Date(drop.on), locale);
  const note = (name: "short" | "spoken") =>
    t("car.priceReduced", { old: formatQuantity(drop.fromJod, "jod", names, name), date });
  return (
    <p className="type-small text-muted">
      <span aria-hidden="true">{note("short")}</span>
      <span className="sr-only">{note("spoken")}</span>
    </p>
  );
}
