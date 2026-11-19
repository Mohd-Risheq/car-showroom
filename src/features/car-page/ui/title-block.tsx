import { Figures } from "@/components/ui/figures";
import type { PublicCarDTO } from "@/lib/db/public-dto";
import type { UnitNames } from "@/lib/format/units";
import type { AppLocale } from "@/lib/i18n/locales";
import { fillSlot, SLOT } from "@/lib/i18n/slot";
import { carTitleLinesIn } from "../domain/title";
import { CarShare } from "./car-share";
import { FindSimilar } from "./find-similar";
import { PriceTag } from "./price-tag";
import type { Translate } from "./translate";

// FR-09's title block (DESIGN §7.2.3), in three groups: who the car is, its title as the page's h1
// with its reference at the body step, left to right in Martian Mono (§9.5), just under it; its
// price, set apart under them; and the car's actions under the price. A reserved or sold car's band
// shows above the title and comes after it in reading order, so a screen reader that jumps to the
// h1 still hears it before the price. A sold car's lead action is Find a similar car (FR-09.9),
// here from 1024 px and in the action bar below. The quiet Share hangs into the margin by its own
// padding, so its icon lines up with the words above it.

type TitleBlockProps = {
  car: PublicCarDTO;
  locale: AppLocale;
  names: UnitNames;
  /** The car page's canonical address, which Share hands on */
  url: string;
  t: Translate;
};

export function TitleBlock({ car, locale, names, url, t }: TitleBlockProps) {
  return (
    <div className="flex flex-col">
      <CarTitle car={car} locale={locale} />
      <StatusBand status={car.status} t={t} />
      <p className="mt-2 type-body text-muted">
        {fillSlot(t("car.ref", { ref: SLOT }), <Figures>{car.refCode}</Figures>)}
      </p>
      <PriceTag car={car} locale={locale} names={names} t={t} className="mt-6 lg:mt-8" />
      {car.status === "sold" ? (
        <FindSimilar car={car} locale={locale} t={t} className="mt-4 hidden self-start lg:inline-flex" />
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2 [&>button:first-child]:-ms-3 [&>button:first-child]:ps-3">
        <CarShare car={car} locale={locale} url={url} t={t} variant="quiet" />
      </div>
    </div>
  );
}

/**
 * The model name at the display step, which sets model names (D-038), with the year and the make on
 * the line above it and the trim after it, both muted, so the name is the title's one line in ink:
 * the title's lines (carTitleLines), so read whole it is the car's title. A trim under an Arabic name
 * keeps clear of its descenders (--title-trim-gap).
 * From 1024 px the title is a container, whose width sets the room the model name takes (tokens.css,
 * D-049). The name is a container of its own, at its usual size, whose width narrows its letters at
 * every width, and a long name's further by its model (model-names.css); it is a block, so its own
 * line height sets its lines.
 */
function CarTitle({ car, locale }: Pick<TitleBlockProps, "car" | "locale">) {
  const { lead, model, trim } = carTitleLinesIn(car, locale);
  return (
    <h1 className="flex flex-col lg:@container/car-title">
      <span className="type-lead text-muted">{lead}</span>{" "}
      <span className="model-name">
        <span className="block type-display" data-model={car.modelKey}>
          {model}
        </span>
      </span>
      {trim === null ? null : (
        <>
          {" "}
          <span className="mt-(--title-trim-gap) type-lead text-muted">{trim}</span>
        </>
      )}
    </h1>
  );
}

/** A reserved car's band, on the --warn hatch, and a sold car's, on --surface-3 */
function StatusBand({ status, t }: { status: PublicCarDTO["status"]; t: Translate }) {
  if (status === "reserved") {
    return (
      <p className="order-first mb-6 hatch p-2">
        <span className="block bg-surface-1 px-3 py-2 type-body surface-edge">{t("car.reserved")}</span>
      </p>
    );
  }
  if (status === "sold") {
    return <p className="order-first mb-6 bg-surface-3 px-3 py-2 type-body surface-edge">{t("car.sold")}</p>;
  }
  return null;
}
