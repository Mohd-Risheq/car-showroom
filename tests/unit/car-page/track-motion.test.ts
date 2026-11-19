import { describe, expect, it, vi } from "vitest";
import { AT_REST, TrackMotion } from "@/features/car-page/ui/track-motion";
import { cssEasing, CURVES, DURATIONS, SPRINGS } from "@/lib/motion-tokens";
import { preferReducedMotion, recordingElement, withMotionDefaults } from "../../support/motion";

// How the fullscreen gallery's photos follow a swipe and settle after it (DESIGN §4.3, §7.2.4).
// Node has no Web Animations, so the track and the black behind it record each animation they are
// given (motion.ts), and a test ends one as the browser would.

const HEIGHT = 780;

function fakeTrack() {
  const track = recordingElement(HEIGHT);
  const backdrop = recordingElement(HEIGHT);
  return { motion: new TrackMotion(track.element, { current: backdrop.element }), track, backdrop };
}

withMotionDefaults();

describe("the gallery's track", () => {
  it("follows a drag, and the black behind it clears as a pull down takes the photo away", () => {
    const { motion, track, backdrop } = fakeTrack();
    motion.drag({ x: -120, y: 0 });
    expect(track.style.translate).toBe("-120px 0px");
    expect(backdrop.style.opacity).toBe("1");
    motion.drag({ x: 0, y: HEIGHT / 4 });
    expect(track.style.translate).toBe("0px 195px");
    expect(backdrop.style.opacity).toBe("0.75");
  });

  it("settles on a spring from where the drag left it, and arrives as its animation ends", () => {
    const { motion, track, backdrop } = fakeTrack();
    const arrive = vi.fn();
    motion.drag({ x: -200, y: 0 });
    motion.settle({ x: -360, y: 0 }, -400, SPRINGS.flick, arrive);
    // The end goes inline first, and the animation shows the way there
    expect(track.style.translate).toBe("-360px 0px");
    const [animation] = track.animations;
    expect(animation?.keyframes.translate).toStrictEqual(["-200px 0px", "-360px 0px"]);
    expect(String(animation?.timing.easing)).toMatch(/^linear\(/);
    expect(backdrop.animations).toHaveLength(1);
    expect(arrive).not.toHaveBeenCalled();
    animation?.onfinish?.();
    expect(arrive).toHaveBeenCalledOnce();
  });

  it("lands where it was going at once, arriving, when a finger lands mid-flight", () => {
    const { motion, track } = fakeTrack();
    const arrive = vi.fn();
    motion.drag({ x: 200, y: 0 });
    motion.settle({ x: 360, y: 0 }, 0, SPRINGS.move, arrive);
    motion.land();
    expect(track.animations[0]?.cancelled).toBe(true);
    expect(track.style.translate).toBe("360px 0px");
    expect(arrive).toHaveBeenCalledOnce();
    // Its end, should it come, arrives no second time
    track.animations[0]?.onfinish?.();
    motion.land();
    expect(arrive).toHaveBeenCalledOnce();
  });

  it("goes back to rest at once, with no arrival, as a button, a key or a new screen size moves on", () => {
    const { motion, track, backdrop } = fakeTrack();
    const arrive = vi.fn();
    motion.drag({ x: 0, y: 300 });
    motion.settle({ x: 0, y: HEIGHT }, 900, SPRINGS.flick, arrive);
    motion.reset();
    expect(track.animations[0]?.cancelled).toBe(true);
    expect(backdrop.animations[0]?.cancelled).toBe(true);
    expect(track.style.translate).toBe("0px 0px");
    expect(backdrop.style.opacity).toBe("1");
    track.animations[0]?.onfinish?.();
    expect(arrive).not.toHaveBeenCalled();
    expect(AT_REST).toStrictEqual({ x: 0, y: 0 });
  });

  it("drops a movement a new drag takes over, with no arrival", () => {
    const { motion, track } = fakeTrack();
    const arrive = vi.fn();
    motion.drag({ x: -100, y: 0 });
    motion.settle(AT_REST, 0, SPRINGS.move, arrive);
    motion.drag({ x: -40, y: 0 });
    expect(track.animations[0]?.cancelled).toBe(true);
    track.animations[0]?.onfinish?.();
    expect(arrive).not.toHaveBeenCalled();
  });

  it("settles over 200 ms on the out curve under reduced motion, with no spring (DESIGN §4.5)", () => {
    preferReducedMotion(true);
    const { motion, track } = fakeTrack();
    motion.drag({ x: -100, y: 0 });
    motion.settle(AT_REST, -800, SPRINGS.flick);
    expect(track.animations[0]?.timing).toStrictEqual({ duration: DURATIONS.pop, easing: cssEasing(CURVES.out) });
  });
});
