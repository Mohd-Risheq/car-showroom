import { describe, expect, it } from "vitest";
import { scrolledPast } from "@/features/shell/ui/header-band";

// DESIGN §7.1.1: the header compacts once the page has scrolled past an 80 px marker at its top
// (src/features/shell/ui/header-band.tsx), as the marker's intersection observer says

const crossing = (isIntersecting: boolean) => ({ isIntersecting });

describe("scrolledPast", () => {
  it("is true while the marker is out of view, and false while it is in view", () => {
    expect(scrolledPast([crossing(false)])).toBe(true);
    expect(scrolledPast([crossing(true)])).toBe(false);
  });

  it("goes by the newest entry of a batch, as the page crossed the marker and back", () => {
    expect(scrolledPast([crossing(false), crossing(true)])).toBe(false);
    expect(scrolledPast([crossing(true), crossing(false)])).toBe(true);
  });

  it("is false with no entry", () => {
    expect(scrolledPast([])).toBe(false);
  });
});
