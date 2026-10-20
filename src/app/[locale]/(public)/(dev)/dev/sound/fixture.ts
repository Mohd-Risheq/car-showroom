import type { ClipType } from "@/features/sound/tach";

// The synthetic engine clips (Q-04, scripts/fixtures/engine-clips.mts) for the T-07 page

export const CLIPS = {
  "steps-8s": { clipType: "idle", seconds: 8 },
  "steps-20s": { clipType: "idle", seconds: 20 },
  "idle-12s": { clipType: "idle", seconds: 12 },
  "rev-6s": { clipType: "rev", seconds: 6 },
} as const satisfies Record<string, { clipType: ClipType; seconds: number }>;

export type ClipName = keyof typeof CLIPS;

export function isClipName(value: string | null): value is ClipName {
  return value !== null && Object.hasOwn(CLIPS, value);
}

/** A run adds a query string, so each run downloads the clip cold */
export function clipUrl(locale: string, clip: ClipName, run: number | null): string {
  return `/${locale}/dev/sound/clips/${clip}.wav${run === null ? "" : `?run=${run}`}`;
}
