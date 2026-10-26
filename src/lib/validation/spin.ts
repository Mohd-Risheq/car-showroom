import { SPIN_DIRECTIONS } from "../db/enums.ts";
import { FRAME_INDEX, HOTSPOT_WINDOW, SPIN_FRAMES } from "./bounds.ts";
import { distinct, fraction, orNull, recordId, text } from "./fields.ts";
import { addIssue } from "./issues.ts";
import { z } from "./zod.ts";

// API-21's spin set (FR-38): its frames in order, the crop, the poster and the hotspots, each placed
// on a key frame as fractions of the frame (BR-18)

const frame = z.object({ index: z.int().min(FRAME_INDEX.min), mediaId: recordId() });

/** VR-17's frames, or exactly its fewest in a demo session, numbered from 0, each its own photo */
function frames(demo: boolean) {
  const max = demo ? SPIN_FRAMES.min : SPIN_FRAMES.max;
  return z.array(frame).check((payload) => {
    const count = payload.value.length;
    const indexes = new Set(payload.value.map(({ index }) => index));
    const numbered = indexes.size === count && payload.value.every(({ index }) => index < count);
    if (count < SPIN_FRAMES.min || count > max) addIssue(payload, { key: "validation.spinFrames", values: { max } });
    else if (!numbered || !distinct(payload.value.map(({ mediaId }) => mediaId))) {
      addIssue(payload, { key: "validation.invalid" });
    }
  });
}

/** In ten-thousandths, so a crop's edges add up without a float's error */
const units = (value: number) => Math.round(value * 10_000);

// A crop's width or height: more than nothing, at most the whole frame
const extent = fraction().check((payload) => {
  if (payload.value === 0) addIssue(payload, { key: "validation.invalid" });
});

const crop = z.object({ x: fraction(), y: fraction(), w: extent, h: extent }).check((payload) => {
  const { x, y, w, h } = payload.value;
  if (units(x) + units(w) > 10_000 || units(y) + units(h) > 10_000) addIssue(payload, { key: "validation.invalid" });
});

const note = orNull(text({ max: 160 }));

const hotspot = z
  .object({
    keyFrame: z.int().min(FRAME_INDEX.min),
    x: fraction(),
    y: fraction(),
    // Frames each side of the key frame where the hotspot shows
    window: z.int().min(HOTSPOT_WINDOW.min).max(HOTSPOT_WINDOW.max),
    noteAr: note,
    noteEn: note,
    closeupMediaId: recordId().nullable().optional(),
  })
  .check((payload) => {
    // VR-18
    if (payload.value.noteAr === null && payload.value.noteEn === null) {
      addIssue(payload, { key: "validation.hotspotNote" });
    }
  });

/** API-21's input; a demo session's spin has exactly 24 frames (TC-38-4) */
export function spinSetSchema({ demo }: { demo: boolean }) {
  return z
    .object({
      frames: frames(demo),
      direction: z.enum(SPIN_DIRECTIONS),
      crop,
      posterFrame: z.int().min(FRAME_INDEX.min),
      hotspots: z.array(hotspot).max(24),
    })
    .check((payload) => {
      // The poster and each key frame are frames of the set
      const count = payload.value.frames.length;
      if (payload.value.posterFrame >= count) addIssue(payload, { key: "validation.invalid" }, ["posterFrame"]);
      payload.value.hotspots.forEach(({ keyFrame }, index) => {
        if (keyFrame >= count) addIssue(payload, { key: "validation.invalid" }, ["hotspots", index, "keyFrame"]);
      });
    });
}

export type SpinSetInput = z.output<ReturnType<typeof spinSetSchema>>;
export type SpinCrop = z.output<typeof crop>;
