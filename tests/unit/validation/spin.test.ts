import { describe, expect, it } from "vitest";
import { validate } from "@/lib/validation/issues";
import { spinSetSchema } from "@/lib/validation/spin";

// API-21's spin set (FR-38): 24 to 72 frames, exactly 24 in a demo session (VR-17, TC-38-4), and
// hotspots with a note in at least one language (VR-18)

const id = (index: number) => `0190a1b2-c3d4-7e5f-8a6b-${index.toString(16).padStart(12, "0")}`;
const frames = (count: number) => Array.from({ length: count }, (_, index) => ({ index, mediaId: id(index) }));
const CROP = { x: 0, y: 0, w: 1, h: 1 };
const HOTSPOT = { keyFrame: 4, x: 0.42, y: 0.61, window: 3, noteAr: null, noteEn: "Small scratch on the rear bumper" };
const SET = { frames: frames(36), direction: "cw", crop: CROP, posterFrame: 0, hotspots: [HOTSPOT] };

function issues(input: object, demo = false): unknown {
  const result = validate(spinSetSchema({ demo }), input);
  return result.ok ? "ok" : result.fieldErrors;
}

describe("the spin set", () => {
  it("takes a set of frames with its crop, poster and hotspots", () => {
    expect(validate(spinSetSchema({ demo: false }), SET)).toStrictEqual({ ok: true, data: SET });
  });

  it("VR-17: 24 to 72 frames, or exactly 24 in a demo session (TC-38-4)", () => {
    expect(issues({ ...SET, frames: frames(24) })).toBe("ok");
    expect(issues({ ...SET, frames: frames(72) })).toBe("ok");
    expect(issues({ ...SET, frames: frames(73) })).toStrictEqual({
      frames: [{ key: "validation.spinFrames", values: { max: 72 } }],
    });
    expect(issues({ ...SET, frames: frames(23) })).toStrictEqual({
      frames: [{ key: "validation.spinFrames", values: { max: 72 } }],
    });
    expect(issues({ ...SET, frames: frames(24) }, true)).toBe("ok");
    expect(issues(SET, true)).toStrictEqual({ frames: [{ key: "validation.spinFrames", values: { max: 24 } }] });
  });

  it("numbers the frames from 0, each once, each its own photo", () => {
    const shuffled = frames(24).map((frame) => (frame.index === 3 ? { ...frame, index: 30 } : frame));
    expect(issues({ ...SET, frames: shuffled })).toStrictEqual({ frames: [{ key: "validation.invalid" }] });
    const fromOne = frames(24).map((frame) => ({ ...frame, index: frame.index + 1 }));
    expect(issues({ ...SET, frames: fromOne })).toStrictEqual({ frames: [{ key: "validation.invalid" }] });
    const fromMinusOne = frames(24).map((frame) => (frame.index === 0 ? { ...frame, index: -1 } : frame));
    expect(issues({ ...SET, frames: fromMinusOne })).toStrictEqual({
      "frames.0.index": [{ key: "validation.invalid" }],
    });
    const twice = frames(24).map((frame) => (frame.index === 3 ? { ...frame, mediaId: id(2) } : frame));
    expect(issues({ ...SET, frames: twice })).toStrictEqual({ frames: [{ key: "validation.invalid" }] });
    const twiceInCapitals = frames(24).map((frame) =>
      frame.index === 3 ? { ...frame, mediaId: id(2).toUpperCase() } : frame,
    );
    expect(issues({ ...SET, frames: twiceInCapitals })).toStrictEqual({ frames: [{ key: "validation.invalid" }] });
  });

  it("takes a poster and key frames among the set's frames", () => {
    expect(issues({ ...SET, posterFrame: 35 })).toBe("ok");
    for (const keyFrame of [0, 35]) {
      expect(issues({ ...SET, hotspots: [{ ...HOTSPOT, keyFrame }] }), String(keyFrame)).toBe("ok");
    }
    expect(issues({ ...SET, posterFrame: 36 })).toStrictEqual({ posterFrame: [{ key: "validation.invalid" }] });
    expect(issues({ ...SET, posterFrame: -1 })).toStrictEqual({ posterFrame: [{ key: "validation.invalid" }] });
    expect(issues({ ...SET, hotspots: [{ ...HOTSPOT, keyFrame: -1 }] })).toStrictEqual({
      "hotspots.0.keyFrame": [{ key: "validation.invalid" }],
    });
    expect(issues({ ...SET, hotspots: [{ ...HOTSPOT, keyFrame: 36 }] })).toStrictEqual({
      "hotspots.0.keyFrame": [{ key: "validation.invalid" }],
    });
  });

  it("VR-18: a hotspot note in Arabic or English, of up to 160 characters", () => {
    expect(issues({ ...SET, hotspots: [{ ...HOTSPOT, noteAr: "خدش بسيط", noteEn: "" }] })).toBe("ok");
    expect(issues({ ...SET, hotspots: [{ ...HOTSPOT, noteEn: " " }] })).toStrictEqual({
      "hotspots.0": [{ key: "validation.hotspotNote" }],
    });
    expect(issues({ ...SET, hotspots: [{ ...HOTSPOT, noteEn: "N".repeat(160) }] })).toBe("ok");
    expect(issues({ ...SET, hotspots: [{ ...HOTSPOT, noteEn: "N".repeat(161) }] })).toStrictEqual({
      "hotspots.0.noteEn": [{ key: "validation.maxChars", values: { max: 160 } }],
    });
  });

  it("places a hotspot as fractions of the frame, shown up to 12 frames either side (BR-18)", () => {
    expect(issues({ ...SET, hotspots: [{ ...HOTSPOT, x: 1, y: 0, window: 12 }] })).toBe("ok");
    expect(issues({ ...SET, hotspots: [{ ...HOTSPOT, x: 1.0001 }] })).toStrictEqual({
      "hotspots.0.x": [{ key: "validation.invalid" }],
    });
    expect(issues({ ...SET, hotspots: [{ ...HOTSPOT, y: -0.0001 }] })).toStrictEqual({
      "hotspots.0.y": [{ key: "validation.invalid" }],
    });
    expect(issues({ ...SET, hotspots: [{ ...HOTSPOT, window: 0 }] })).toBe("ok");
    for (const window of [-1, 13]) {
      expect(issues({ ...SET, hotspots: [{ ...HOTSPOT, window }] }), String(window)).toStrictEqual({
        "hotspots.0.window": [{ key: "validation.invalid" }],
      });
    }
    expect(issues({ ...SET, hotspots: Array.from({ length: 24 }, () => HOTSPOT) })).toBe("ok");
    expect(issues({ ...SET, hotspots: Array.from({ length: 25 }, () => HOTSPOT) })).toStrictEqual({
      hotspots: [{ key: "validation.invalid" }],
    });
  });

  it("keeps the crop inside the frame", () => {
    expect(issues({ ...SET, crop: { x: 0.1, y: 0.05, w: 0.8, h: 0.9 } })).toBe("ok");
    expect(issues({ ...SET, crop: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } })).toBe("ok");
    expect(issues({ ...SET, crop: { x: 0.3, y: 0, w: 0.8, h: 1 } })).toStrictEqual({
      crop: [{ key: "validation.invalid" }],
    });
    expect(issues({ ...SET, crop: { x: 0.5, y: 0, w: 0.5001, h: 1 } })).toStrictEqual({
      crop: [{ key: "validation.invalid" }],
    });
    expect(issues({ ...SET, crop: { x: 0, y: 0.5, w: 1, h: 0.5001 } })).toStrictEqual({
      crop: [{ key: "validation.invalid" }],
    });
    expect(issues({ ...SET, crop: { x: 0, y: 0, w: 0.0001, h: 1 } })).toBe("ok");
    expect(issues({ ...SET, crop: { x: 0, y: 0, w: 0, h: 1 } })).toStrictEqual({
      "crop.w": [{ key: "validation.invalid" }],
    });
  });
});
