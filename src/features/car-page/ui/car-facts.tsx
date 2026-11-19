import { InfoIcon } from "@phosphor-icons/react/ssr";
import { Figures } from "@/components/ui/figures";
import { Quantity } from "@/components/ui/quantity";
import { cn } from "@/lib/class-names";
import type { PublicCarDTO, PublicMileageCheck } from "@/lib/db/public-dto";
import { formatDate, formatMonthYear } from "@/lib/format/dates";
import { formatNumber } from "@/lib/format/numbers";
import type { UnitNames } from "@/lib/format/units";
import { beforeSign, isolate } from "@/lib/i18n/bidi";
import { textIn } from "@/lib/i18n/bilingual";
import { type AppLocale, directionOf } from "@/lib/i18n/locales";
import { fillSlot, SLOT } from "@/lib/i18n/slot";
import { batteryHealth, type FactValue, keyFacts } from "../domain/facts";
import type { Translate } from "./translate";

// FR-09's facts under the title block (DESIGN §7.2.3), between a --line rule above and one below,
// as a table's (§3.1, D-049): the key facts (FR-09.3, §6.3's KeyFactsStrip), labels muted and values
// in ink, with numbers and the VIN in Martian Mono (§3.3); the mileage check (FR-09.4), which opens
// to the rule that set it, where a tooltip would keep it from touch and from readers who don't hover
// (D-049); battery health and how it was measured (FR-09.5); and the agency warranty. The server
// renders all of it, with no script.

type CarFactsProps = {
  car: PublicCarDTO;
  locale: AppLocale;
  names: UnitNames;
  t: Translate;
};

export function CarFacts({ car, locale, names, t }: CarFactsProps) {
  const battery = batteryHealth(car);
  return (
    <div className="flex flex-col gap-4 border-y border-line py-5 lg:py-6">
      <KeyFacts car={car} locale={locale} names={names} t={t} />
      {car.mileageCheck === null ? null : (
        <MileageCheck check={car.mileageCheck} modelYear={car.modelYear} locale={locale} t={t} />
      )}
      {battery === null ? null : <BatteryHealth battery={battery} locale={locale} t={t} />}
      {car.warrantyUntil === null ? null : (
        <p className="type-body">{t("car.warranty", { date: formatDate(car.warrantyUntil, locale) })}</p>
      )}
    </div>
  );
}

/**
 * The facts as a definition list of cells on the page's ground, each label over its value, read row
 * by row in FR-09.3's order: one column under 360 px, where a word such as Comprehensive would fill
 * half the screen (D-041), two from 360 px, three from 768 px, where the list runs the page's
 * width, and two again from 1024 px in the facts' column. A code reads as one, and the VIN's figures
 * are wider than a cell on a phone, so it takes a row of its own at every width.
 */
function KeyFacts({ car, locale, names, t }: CarFactsProps) {
  return (
    <section>
      <h2 className="sr-only">{t("car.facts.title")}</h2>
      <dl className="grid gap-x-4 gap-y-5 sm:grid-cols-2 md:grid-cols-3 md:gap-x-6 lg:grid-cols-2">
        {keyFacts(car).map(({ label, value }) => (
          <div key={label} className={cn("flex flex-col gap-1", value.kind === "code" && "col-span-full")}>
            <dt className="type-small text-muted">{t(label)}</dt>
            <dd className="type-body">
              <Fact value={value} locale={locale} names={names} t={t} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** A fact's value, as its kind is shown */
function Fact({ value, locale, names, t }: { value: FactValue } & Omit<CarFactsProps, "car">) {
  switch (value.kind) {
    case "quantity":
      return <Quantity value={value.value} unit={value.unit} names={names} figures />;
    case "figure":
      // As it is: a year is never grouped, and a count of owners or seats is under a thousand
      return <Figures>{String(value.value)}</Figures>;
    case "copy":
      return t(value.key);
    case "month":
      return formatMonthYear(value.value, locale);
    case "text": {
      const words = textIn(value.text, locale);
      return words === null ? null : (
        <span lang={words.lang} dir={directionOf(words.lang)}>
          {words.text}
        </span>
      );
    }
    case "code":
      return <Figures>{value.value}</Figures>;
  }
}

type MileageCheckProps = { check: PublicMileageCheck; modelYear: number; locale: AppLocale; t: Translate };

/**
 * The band of the car's kilometres a year for its age, which opens to the dealer's bands (BR-06). Its
 * summary is as wide as its words, so the focus ring hugs them, and its icon turns to ink while it is
 * open or under the pointer.
 */
function MileageCheck({ check, modelYear, locale, t }: MileageCheckProps) {
  const km = (value: number) => isolate(formatNumber(value, locale));
  return (
    <details className="group/mileage">
      <summary className="group/summary flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 type-body [&::-webkit-details-marker]:hidden">
        {t(`car.mileage.${check.band}`)}
        <InfoIcon
          aria-hidden="true"
          className="size-icon shrink-0 text-muted group-open/mileage:text-ink group-hover/summary:text-ink"
        />
      </summary>
      <p className="max-w-measure type-small text-muted">
        {t("car.mileage.info", {
          km: km(check.kmPerYear),
          year: isolate(String(modelYear)),
          low: km(check.low),
          high: km(check.high),
        })}
      </p>
    </details>
  );
}

type BatteryHealthProps = { battery: NonNullable<PublicCarDTO["battery"]>; locale: AppLocale; t: Translate };

/**
 * The battery's health, with a bar as full as the battery that screen readers skip, as the words
 * say it. The figures read left to right with the message's own sign after them (beforeSign).
 */
function BatteryHealth({ battery, locale, t }: BatteryHealthProps) {
  const pct = <span className="figures">{beforeSign(formatNumber(battery.pct, locale))}</span>;
  return (
    <div className="flex flex-col gap-2">
      <p className="type-body">{fillSlot(t("car.battery", { pct: SLOT }), pct)}</p>
      <div aria-hidden="true" className="h-2 bg-surface-3 surface-edge">
        <div className="h-full bg-ink surface-edge" style={{ inlineSize: `${battery.pct}%` }} />
      </div>
      <p className="type-small text-muted">
        {t("car.batterySource", { source: t(`enum.soh_source.${battery.source}`) })}
      </p>
    </div>
  );
}
