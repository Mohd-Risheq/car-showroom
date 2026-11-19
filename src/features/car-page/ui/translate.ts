import type { PhotoGroup, SohSource } from "@/lib/db/enums";
import type { FEATURE_GROUPS } from "@/lib/db/feature-keys";
import type { MileageBand } from "@/lib/db/public-dto";
import type { FactCopy, FactLabel } from "../domain/facts";

// The car page's copy (DESIGN §9.2's car deck, the fields and values its facts name, and the errors
// the page and its sections show), which its parts take from the page, so each renders with no
// request of its own

export type CarPageKey =
  | `car.${"ref" | "priceReduced" | "priceBeforeCustoms" | "reserved" | "sold" | "findSimilar"}`
  | `car.${"share" | "linkCopied"}`
  | "card.priceDropped"
  | "car.facts.title"
  | FactLabel
  | FactCopy
  | `car.mileage.${MileageBand | "info"}`
  | `car.${"battery" | "batterySource" | "warranty"}`
  | `enum.soh_source.${SohSource}`
  | `car.features.${"title" | keyof typeof FEATURE_GROUPS}`
  | `car.description.${"title" | "onlyArabic" | "onlyEnglish"}`
  | `car.gallery.${"alt" | "altImperfection" | "imperfection" | "more" | "fullscreen" | "position" | "zoomIn" | "zoomOut"}`
  | `enum.photo_group.${PhotoGroup}`
  | "car.sectionError"
  | `evidence.${"title" | "closeups"}`
  | `common.${"close" | "previous" | "next"}`
  | "errors.code.internal";

/** The catalog's messages, as next-intl's getTranslations() gives them */
export type Translate = (key: CarPageKey, values?: Record<string, string | number>) => string;
