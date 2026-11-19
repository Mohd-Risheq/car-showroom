import { describe, expect, it } from "vitest";
import { releaseSpring } from "@/components/ui/sheet-gesture";
import { FLICK_SPEED } from "@/lib/motion/drag-release";
import { SPRINGS } from "@/lib/motion-tokens";

describe("the bottom sheet's release", () => {
  it("settles with the flick spring only after a release faster than a flick, either way", () => {
    expect(releaseSpring(FLICK_SPEED + 1)).toBe(SPRINGS.sheetAfterFlick);
    expect(releaseSpring(-(FLICK_SPEED + 1))).toBe(SPRINGS.sheetAfterFlick);
    expect(releaseSpring(FLICK_SPEED)).toBe(SPRINGS.sheetAfterTap);
    expect(releaseSpring(-FLICK_SPEED)).toBe(SPRINGS.sheetAfterTap);
  });
});
