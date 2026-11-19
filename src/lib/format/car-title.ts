import { isolateScripts } from "@/lib/i18n/bidi";

// The car title (SRS FR-06, FR-09): the model year, the make, the model and the trim, as "2021 Toyota
// Corolla Hybrid", or "2021 تويوتا كورولا Hybrid" in Arabic. The make and the model have a name in
// each language (SRS §6.4), and the trim one spelling for both (ENT-Car), which the dealer types. Its
// Latin and Arabic parts each go in an isolate of their direction, so a trim that mixes them reads in
// its order in either language (DESIGN §10.3), and a sign that ends a Latin part, as "Crozz Pure+"
// does, stays at its end (UAX #9, FR-01.8).

export type CarTitleParts = {
  modelYear: number;
  /** The make's and the model's names in the page's language */
  make: string;
  model: string;
  trim: string | null;
};

/**
 * The title's lines, as the car page's h1 sets them: the year and the make, the model, and the trim,
 * isolated, which is null where the car has none
 */
export type CarTitleLines = { lead: string; model: string; trim: string | null };

/** A car's title in its lines, in the language its make and model are named in */
export function carTitleLines({ modelYear, make, model, trim }: CarTitleParts): CarTitleLines {
  return { lead: `${modelYear} ${make}`, model, trim: trim === null || trim === "" ? null : isolateScripts(trim) };
}

/** A car's title in the language its make and model are named in, without the trim it doesn't have */
export function carTitle(parts: CarTitleParts): string {
  const { lead, model, trim } = carTitleLines(parts);
  return trim === null ? `${lead} ${model}` : `${lead} ${model} ${trim}`;
}
