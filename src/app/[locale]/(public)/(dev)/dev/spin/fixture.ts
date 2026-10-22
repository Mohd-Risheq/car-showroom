import {
  type SpinFormat,
  type SpinSetName,
  SPIN_SETS,
  SPIN_WIDTHS,
  spinFrameSize,
  spinFrameUrl,
} from "@/app/_dev/fixtures";
import type { SpinSource } from "@/features/spin/ui/store";

// The synthetic spin fixture (src/app/_dev/fixtures.ts) as a spin source for the T-05 page

/** A cold run adds a query string, so no frame comes from the browser's cache */
export function fixtureSource(locale: string, set: SpinSetName, format: SpinFormat, run: string | null): SpinSource {
  const frame = (index: number, width: number) => ({
    url: spinFrameUrl(locale, { set, index, width, format }, run),
    size: spinFrameSize(set, width),
  });
  return {
    frames: SPIN_SETS[set].frames,
    lowRes: (index) => frame(index, SPIN_WIDTHS.low),
    highRes: (index) => frame(index, SPIN_WIDTHS.high),
  };
}
