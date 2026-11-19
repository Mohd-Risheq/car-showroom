import type { PublicCarDTO } from "@/lib/db/public-dto";
import { type CarTitleLines, type CarTitleParts, carTitle, carTitleLines } from "@/lib/format/car-title";
import type { AppLocale } from "@/lib/i18n/locales";

type TitledCar = Pick<PublicCarDTO, "modelYear" | "makeName" | "modelName" | "trim">;

/** The car's title's parts in the page's language */
function partsIn(car: TitledCar, locale: AppLocale): CarTitleParts {
  return { modelYear: car.modelYear, make: car.makeName[locale], model: car.modelName[locale], trim: car.trim };
}

/** The car's title in the page's language: FR-09's h1, and the page's title */
export function carTitleIn(car: TitledCar, locale: AppLocale): string {
  return carTitle(partsIn(car, locale));
}

/** The car's title in the page's language, in the lines FR-09's h1 sets it in */
export function carTitleLinesIn(car: TitledCar, locale: AppLocale): CarTitleLines {
  return carTitleLines(partsIn(car, locale));
}
