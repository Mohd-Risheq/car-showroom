import { describe, expect, it } from "vitest";
import { closeupCount } from "@/features/car-page/domain/evidence";
import type { PanelState, PhotoGroup } from "@/lib/db/enums";

// FR-09.13's close-ups: the photos of the panels that aren't original (BR-09's replaced, repainted
// and touch-ups), which the evidence strip counts and links to in the gallery's imperfection group
// (FR-09.13a), and leaves out for a car with none (FR-09.13c, D-046).

const photo = (id: string, group: PhotoGroup = "imperfection") => ({ id, group });
const panel = (state: PanelState, closeupPhotoId: string | null) => ({ state, closeupPhotoId });

const IMPERFECTIONS = [photo("p1"), photo("p2"), photo("p3")];

describe("closeupCount", () => {
  it("counts the close-ups of the replaced, repainted and touched-up panels", () => {
    const panels = [panel("replaced", "p1"), panel("repainted", "p2"), panel("touch_up", "p3")];
    expect(closeupCount({ photos: IMPERFECTIONS, inspection: { panels } })).toBe(3);
  });

  it("counts a photo of two panels once", () => {
    const panels = [panel("repainted", "p1"), panel("touch_up", "p1")];
    expect(closeupCount({ photos: IMPERFECTIONS, inspection: { panels } })).toBe(1);
  });

  it("leaves out an original panel's photo, an unknown one's, and a panel without a close-up", () => {
    const panels = [panel("original", "p1"), panel("unknown", "p2"), panel("replaced", null)];
    expect(closeupCount({ photos: IMPERFECTIONS, inspection: { panels } })).toBe(0);
  });

  it("leaves out a close-up outside the imperfection group, which the chip's link doesn't open", () => {
    const photos = [photo("p1", "exterior"), photo("p2"), photo("p3", "engine")];
    const panels = [panel("touch_up", "p1"), panel("repainted", "p2"), panel("replaced", "p3")];
    expect(closeupCount({ photos, inspection: { panels } })).toBe(1);
  });

  it("is none for a car without an inspection, and when every panel is original", () => {
    expect(closeupCount({ photos: IMPERFECTIONS, inspection: null })).toBe(0);
    const panels = IMPERFECTIONS.map(({ id }) => panel("original", id));
    expect(closeupCount({ photos: IMPERFECTIONS, inspection: { panels } })).toBe(0);
  });
});
