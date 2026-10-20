// The Hear It tachometer (FR-15, BR-19, DESIGN §5.3): the dial for each fuel type, and the mapping
// from the clip's loudness to the needle, with its smoothing. Pure, so the T-07 spike and T-40's
// card share it. Values are in ×1000 rpm, angles in degrees with 0° pointing up.

export type FuelType = "gasoline" | "diesel" | "electric" | "hybrid" | "mild_hybrid" | "plugin_hybrid";
export type ClipType = "cold_start" | "idle" | "rev";
export type Dial = { max: number; redline: number };

/** BR-19: gasoline and every hybrid 0 to 8 with the redline from 6.5, diesel 0 to 6 from 4.5 */
export function dialFor(fuel: FuelType): Dial | null {
  // FR-15.10: electric cars have no engine audio and no card
  if (fuel === "electric") return null;
  return fuel === "diesel" ? { max: 6, redline: 4.5 } : { max: 8, redline: 6.5 };
}

/** DESIGN §5.3: a 240° arc, from 0 at -120° to the dial's maximum at +120° */
export const ARC_DEGREES = 240;

export function angleFor(value: number, dial: Dial): number {
  return -ARC_DEGREES / 2 + (value / dial.max) * ARC_DEGREES;
}

// BR-19 gives no number for either of these, so both are interpretations (D-029)
/** Where the needle rests while nothing plays: an engine that's off */
export const REST = 0;
/** BR-19's idleAngle, where the clip's floor maps to: 800 rpm, a typical idle */
export const IDLE = 0.8;

/** BR-19's topAngle: 1.5 on an idle clip, 2.5 on a cold start, and the redline minus 1 on a rev */
export function topFor(clip: ClipType, dial: Dial): number {
  if (clip === "idle") return 1.5;
  if (clip === "cold_start") return 2.5;
  return dial.redline - 1;
}

/** Silence has no level in decibels, so it counts as this */
export const SILENCE_DB = -120;

/** The RMS level of samples[start, end) in dBFS */
export function rmsDb(samples: Float32Array, start = 0, end = samples.length): number {
  let sum = 0;
  for (let i = start; i < end; i += 1) {
    const sample = samples[i] ?? 0;
    sum += sample * sample;
  }
  if (end <= start || sum === 0) return SILENCE_DB;
  return Math.max(SILENCE_DB, 10 * Math.log10(sum / (end - start)));
}

/** Nearest-rank percentile, p from 0 to 100 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new RangeError("percentile of no values");
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1] as number;
}

/** BR-19's per-clip range: the 10th and 99th percentile of the clip's RMS levels */
export type Levels = { floorDb: number; ceilDb: number };

/**
 * The clip's range, from back-to-back windows of `windowSize` samples. Use the analyser's window
 * size at the same sample rate, so the range and the live level measure the same thing.
 */
export function clipLevels(samples: Float32Array, windowSize: number): Levels {
  const levels: number[] = [];
  for (let start = 0; start + windowSize <= samples.length; start += windowSize) {
    levels.push(rmsDb(samples, start, start + windowSize));
  }
  if (levels.length === 0) return { floorDb: SILENCE_DB, ceilDb: SILENCE_DB };
  return { floorDb: percentile(levels, 10), ceilDb: percentile(levels, 99) };
}

// A clip with almost no dynamics would divide by nearly zero
const MIN_SPAN_DB = 1;

/**
 * BR-19's mapping, from an RMS level to where the needle heads. Levels outside the clip's range
 * stop at idle and at the top, so a quiet idle never swings toward the redline (D-029).
 */
export function needleTarget(levelDb: number, levels: Levels, top: number): number {
  const span = Math.max(levels.ceilDb - levels.floorDb, MIN_SPAN_DB);
  const position = Math.min(1, Math.max(0, (levelDb - levels.floorDb) / span));
  return IDLE + position * (top - IDLE);
}

/** BR-19's moving average weight, per 60 Hz frame */
export const ALPHA = 0.25;
const FRAME_MS = 1000 / 60;

/**
 * One step of BR-19's moving average. α applies per 60 Hz frame, so a 120 Hz screen takes two
 * smaller steps in the same time and the needle moves alike on every device (D-029).
 */
export function smooth(previous: number, target: number, elapsedMs: number): number {
  const weight = 1 - (1 - ALPHA) ** (Math.max(0, elapsedMs) / FRAME_MS);
  return previous + weight * (target - previous);
}
