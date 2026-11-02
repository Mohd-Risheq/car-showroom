import { isolate } from "@/lib/i18n/bidi";

// The car title (SRS FR-06, FR-09): the model year, the make, the model and the trim, as "2021 Toyota
// Corolla Hybrid", or "2021 تويوتا كورولا Hybrid" in Arabic. The make and the model have a name in
// each language (SRS §6.4), and the trim one spelling for both (ENT-Car). In Arabic text it is a
// Latin run that may end in a sign, as "Crozz Pure+" does, and outside an isolate the sign would show
// at the run's other end (UAX #9, FR-01.8).

export type CarTitleParts = {
  modelYear: number;
  /** The make's and the model's names in the page's language */
  make: string;
  model: string;
  trim: string | null;
};

/** A car's title in the language its make and model are named in, without the trim it doesn't have */
export function carTitle({ modelYear, make, model, trim }: CarTitleParts): string {
  const words = [String(modelYear), make, model];
  return (trim === null || trim === "" ? words : [...words, isolate(trim)]).join(" ");
}
