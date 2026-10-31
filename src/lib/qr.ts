import { encode } from "uqr";

// The site's QR codes (BUILD-PLAN's shared QR encoder): the WhatsApp link on the desktop contact
// sheet (FR-25.3), the otpauth URI of two-step sign-in (FR-29.7), the Window Card's short link (FR-42)
// and the family card's car link (FR-26.4). Error correction is M at least, which recovers 15% of a
// damaged code (FR-42.2), and is raised where the code's size allows. A code is one SVG path, a
// rectangle per run of dark modules in module units, inside the 4-module quiet zone the QR standard
// asks for, so it draws sharp at any size, on screen or on paper. Text is encoded as UTF-8.

/** The error correction a code has at least: L, which recovers 7%, is never used (FR-42.2) */
export type QrErrorCorrection = "M" | "Q" | "H";

/** The light margin a reader needs around a code to find it, in modules (ISO/IEC 18004) */
const QUIET_ZONE = 4;

export type QrCode = {
  /** Modules on a side, the quiet zone's included: the path's viewBox is 0 0 size size */
  readonly size: number;
  /** The dark modules, in module units */
  readonly path: string;
};

/** The QR code of a text. Throws when the text is too long for one. */
export function encodeQr(text: string, { ecc = "M" }: { ecc?: QrErrorCorrection } = {}): QrCode {
  const { size, data } = encode(text, { ecc, boostEcc: true, border: QUIET_ZONE });
  const path = data
    .flatMap((row, y) => darkRuns(row).map(([from, to]) => `M${from} ${y}h${to - from}v1h${from - to}z`))
    .join("");
  return { size, path };
}

/** A row's runs of dark modules, each as its first module and the one past its last */
function darkRuns(row: readonly boolean[]): [number, number][] {
  const runs: [number, number][] = [];
  let from = -1;
  row.forEach((dark, x) => {
    if (dark && from < 0) from = x;
    if (!dark && from >= 0) {
      runs.push([from, x]);
      from = -1;
    }
  });
  if (from >= 0) runs.push([from, row.length]);
  return runs;
}
