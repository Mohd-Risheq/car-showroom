import { checkVin, normalizeVin, type VinWarning } from "@/lib/validation/vin";

// What the VIN scanner reads, and what it keeps of it (FR-36.2)

/** The formats FR-36.2 names */
export const VIN_FORMATS = ["code_39", "code_128", "data_matrix", "qr_code"] as const;

export type VinFromBarcode = { vin: string; warning: VinWarning | null };

/**
 * The VIN in a barcode's text, or null. Some labels put an "I" import marker before the VIN, which
 * never contains that letter. Only a 17-character candidate that passes VR-04 is kept, so a
 * misread North American VIN, whose check digit fails, never fills the field.
 */
export function vinFromBarcode(text: string): VinFromBarcode | null {
  let candidate = normalizeVin(text);
  if (candidate.length === 18 && candidate.startsWith("I")) candidate = candidate.slice(1);
  const check = checkVin(candidate);
  return check.ok ? { vin: candidate, warning: check.warning } : null;
}

export type Region = { x: number; y: number; width: number; height: number };

/**
 * The part of a camera frame the WebAssembly scanner reads: a centred band, twice as wide as it is
 * tall, across 90 % of the frame. It keeps the frame's own pixels, because a Code 39 VIN is about
 * 260 modules wide and reads poorly below 2 pixels a module. The screen shows the same band.
 */
export function scanRegion(frameWidth: number, frameHeight: number): Region {
  const width = Math.round(frameWidth * 0.9);
  const height = Math.min(frameHeight, Math.round(width / 2));
  return { x: Math.round((frameWidth - width) / 2), y: Math.round((frameHeight - height) / 2), width, height };
}
