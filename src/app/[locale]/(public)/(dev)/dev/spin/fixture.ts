import type { Size } from "@/features/spin/ring";
import type { SpinSource } from "@/features/spin/store";

// The synthetic spin fixture (Q-04, scripts/fixtures/spin-dials.mts) as spin sets for the T-05
// page: 36 and 72 landscape frames, and 72 portrait frames for the letterbox edge case.

export type FixtureSet = "l36" | "l72" | "p72";
export type FixtureFormat = "webp" | "jpg";

const SETS: Record<FixtureSet, { frames: number; low: Size; high: Size }> = {
  l36: { frames: 36, low: { width: 480, height: 320 }, high: { width: 1280, height: 853 } },
  l72: { frames: 72, low: { width: 480, height: 320 }, high: { width: 1280, height: 853 } },
  p72: { frames: 72, low: { width: 480, height: 720 }, high: { width: 1280, height: 1920 } },
};

export function isFixtureSet(value: string | null): value is FixtureSet {
  return value === "l36" || value === "l72" || value === "p72";
}

/** A cold run adds a query string, so no frame comes from the browser's cache */
export function fixtureSource(locale: string, set: FixtureSet, format: FixtureFormat, run: string | null): SpinSource {
  const { frames, low, high } = SETS[set];
  const url = (index: number, width: number) =>
    `/${locale}/dev/spin/frames/${set}-${String(index).padStart(2, "0")}-${width}.${format}${run ? `?run=${run}` : ""}`;
  return {
    frames,
    lowRes: (index) => ({ url: url(index, low.width), size: low }),
    highRes: (index) => ({ url: url(index, high.width), size: high }),
  };
}
