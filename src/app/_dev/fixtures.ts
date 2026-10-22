import type { ClipType } from "@/features/sound/domain/tach";
import type { Size } from "@/features/spin/domain/ring";

// The synthetic fixtures of the Phase 0 spikes (Q-04), in one place: what scripts/fixtures/
// writes into the git-ignored .fixtures/ folder, what the dev pages ask for and what the dev
// routes serve. They never ship: 05-SEED-DATA §3.4 and §3.5 have the real media. Node loads this
// module from the scripts, so it imports types only.

/** The folders the scripts write, from the project root */
export const SPIN_FOLDER = ".fixtures/spin";
export const SOUND_FOLDER = ".fixtures/sound";

/** The spin sets (T-05): 36 and 72 landscape frames, and 72 portrait frames for the letterbox edge case (FR-16) */
export const SPIN_SETS = {
  l36: { frames: 36, aspect: 3 / 2 },
  l72: { frames: 72, aspect: 3 / 2 },
  p72: { frames: 72, aspect: 2 / 3 },
} as const;
export type SpinSetName = keyof typeof SPIN_SETS;

/** BR-20's spin frame variants: the low-resolution pass and the high-resolution frames */
export const SPIN_WIDTHS = { low: 480, high: 1280 } as const;
export const SPIN_FORMATS = ["webp", "jpg"] as const;
export type SpinFormat = (typeof SPIN_FORMATS)[number];

/** The engine clips (T-07, T-08), in BR-19's output format */
export const ENGINE_CLIPS = {
  "steps-8s": { clipType: "idle", seconds: 8 },
  "steps-20s": { clipType: "idle", seconds: 20 },
  "idle-12s": { clipType: "idle", seconds: 12 },
  "rev-6s": { clipType: "rev", seconds: 6 },
} as const satisfies Record<string, { clipType: ClipType; seconds: number }>;
export type ClipName = keyof typeof ENGINE_CLIPS;

export function isSpinSetName(value: string | null): value is SpinSetName {
  return value !== null && Object.hasOwn(SPIN_SETS, value);
}

export function isClipName(value: string | null): value is ClipName {
  return value !== null && Object.hasOwn(ENGINE_CLIPS, value);
}

export function spinFrameSize(set: SpinSetName, width: number): Size {
  return { width, height: Math.round(width / SPIN_SETS[set].aspect) };
}

export function spinFrameFile(set: SpinSetName, index: number, width: number, format: SpinFormat): string {
  return `${set}-${String(index).padStart(2, "0")}-${width}.${format}`;
}

/** The format of a frame file the spin script writes, or undefined for any other name */
export function spinFrameFormat(file: string): SpinFormat | undefined {
  const [, set = null, index = "", width = "", format = ""] = /^(\w+)-(\d+)-(\d+)\.(\w+)$/.exec(file) ?? [];
  const known = SPIN_FORMATS.find((candidate) => candidate === format);
  if (!isSpinSetName(set) || known === undefined || Number(index) >= SPIN_SETS[set].frames) return undefined;
  if (Number(width) !== SPIN_WIDTHS.low && Number(width) !== SPIN_WIDTHS.high) return undefined;
  // The script writes one name for each frame, so "l36-00-0480.webp" names none
  return spinFrameFile(set, Number(index), Number(width), known) === file ? known : undefined;
}

export function clipFile(clip: ClipName): string {
  return `${clip}.wav`;
}

/** The clip a file the sound script writes holds, or undefined for any other name */
export function clipOfFile(file: string): ClipName | undefined {
  const name = file.endsWith(".wav") ? file.slice(0, -".wav".length) : null;
  return isClipName(name) ? name : undefined;
}

/** The frame's URL on the dev frame route. A cold run adds a query string, so no frame comes from the cache. */
export function spinFrameUrl(
  locale: string,
  frame: { set: SpinSetName; index: number; width: number; format: SpinFormat },
  run: string | null,
): string {
  const file = spinFrameFile(frame.set, frame.index, frame.width, frame.format);
  return `/${locale}/dev/spin/frames/${file}${run ? `?run=${run}` : ""}`;
}

/** The clip's URL on the dev clip route. A run adds a query string, so each run downloads the clip cold. */
export function clipUrl(locale: string, clip: ClipName, run: number | null): string {
  return `/${locale}/dev/sound/clips/${clipFile(clip)}${run === null ? "" : `?run=${run}`}`;
}
