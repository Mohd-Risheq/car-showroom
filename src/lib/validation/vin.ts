// The VIN rules (VR-04, BR-23), shared by typed entry and the barcode scanner (FR-36.1, FR-36.2).
// T-16's Zod schema for VR-04 calls checkVin rather than repeating it.

const VIN = /^[A-HJ-NPR-Z0-9]{17}$/;

// ISO 3779 transliteration (05-SEED-DATA §6.1). Digits keep their value; I, O and Q never occur.
const LETTERS: Readonly<Record<string, number>> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2] as const;

export type VinError = "validation.vin" | "validation.vinCheckDigit";
export type VinWarning = "validation.vinCheckDigitWarn";

/** The message keys of DESIGN §9.2: an error blocks the VIN, a warning lets the user keep it */
export type VinCheck = { ok: true; warning: VinWarning | null } | { ok: false; error: VinError };

/** How typed or scanned text is compared with the rules: trimmed, in capitals */
export function normalizeVin(text: string): string {
  return text.trim().toUpperCase();
}

/** The check digit position 9 should hold: "0" to "9", or "X" for 10. Takes a VIN of the right form. */
export function vinCheckDigit(vin: string): string {
  let sum = 0;
  WEIGHTS.forEach((weight, index) => {
    const character = vin.charAt(index);
    sum += (LETTERS[character] ?? Number(character)) * weight;
  });
  const remainder = sum % 11;
  return remainder === 10 ? "X" : String(remainder);
}

/** A World Manufacturer Identifier from North America starts with 1 to 5 (BR-23) */
export function isNorthAmerican(vin: string): boolean {
  return /^[1-5]/.test(vin);
}

/** VR-04 on a normalized VIN. A check digit mismatch is an error in North America and a warning elsewhere (BR-23). */
export function checkVin(vin: string): VinCheck {
  if (!VIN.test(vin)) return { ok: false, error: "validation.vin" };
  if (vin.charAt(8) === vinCheckDigit(vin)) return { ok: true, warning: null };
  return isNorthAmerican(vin) ? { ok: false, error: "validation.vinCheckDigit" } : { ok: true, warning: "validation.vinCheckDigitWarn" };
}
