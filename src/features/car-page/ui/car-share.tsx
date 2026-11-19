import type { PublicCarDTO } from "@/lib/db/public-dto";
import type { AppLocale } from "@/lib/i18n/locales";
import { carTitleIn } from "../domain/title";
import { ShareButton } from "./share-button";
import type { Translate } from "./translate";

// The car's Share (FR-09.11) with what the server gives it: the car's title, its page's canonical
// address and the words it shows. The title block holds one, and the page ends with another (DESIGN
// §7.2.3's Region J), where Ask your family joins it with T-46.

type CarShareProps = {
  car: Pick<PublicCarDTO, "id" | "modelYear" | "makeName" | "modelName" | "trim">;
  locale: AppLocale;
  /** The car page's canonical address */
  url: string;
  t: Translate;
  variant: "quiet" | "secondary";
};

export function CarShare({ car, locale, url, t, variant }: CarShareProps) {
  return (
    <ShareButton
      link={{ title: carTitleIn(car, locale), url }}
      car={car.id}
      labels={{ share: t("car.share"), linkCopied: t("car.linkCopied"), failed: t("errors.code.internal") }}
      variant={variant}
    />
  );
}
