import { ScrollTrigger } from "gsap/ScrollTrigger";
import { afterEach, describe, expect, it, vi } from "vitest";
import { watchLayout } from "@/lib/motion/gsap";

// DESIGN §4.4: ScrollTrigger measures each scrub again after the layout moves, without forcing a
// measure mid-scroll, and stops watching when the scrub goes

/** A ResizeObserver or MutationObserver that records what it watches */
class FakeObserver {
  static made: FakeObserver[] = [];
  readonly notify: () => void;
  readonly observed: unknown[][] = [];
  connected = true;

  constructor(notify: () => void) {
    this.notify = notify;
    FakeObserver.made.push(this);
  }

  observe(...target: unknown[]) {
    this.observed.push(target);
  }

  disconnect() {
    this.connected = false;
  }
}

afterEach(() => {
  FakeObserver.made = [];
  vi.restoreAllMocks();
});

describe("GSAP's chunk", () => {
  it("measures again once the page's size, language or direction changes, until the scrub stops watching", () => {
    vi.stubGlobal("ResizeObserver", FakeObserver);
    vi.stubGlobal("MutationObserver", FakeObserver);
    vi.stubGlobal("document", { body: "body", documentElement: "html" });
    const refresh = vi.spyOn(ScrollTrigger, "refresh").mockImplementation(() => {});

    const stop = watchLayout();
    expect(FakeObserver.made.map((observer) => observer.observed)).toEqual([
      [["body"]],
      [["html", { attributeFilter: ["lang", "dir"] }]],
    ]);
    // ScrollTrigger's safe refresh, which waits for the layout to settle and the scroll to end
    for (const observer of FakeObserver.made) observer.notify();
    expect(refresh.mock.calls).toEqual([[true], [true]]);

    stop();
    expect(FakeObserver.made.map((observer) => observer.connected)).toEqual([false, false]);
  });
});
