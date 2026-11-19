import { describe, expect, it } from "vitest";
import { animateLook, backdropOpacity, showLook } from "@/lib/motion/backdrop-motion";
import { GENTLE } from "@/lib/motion/release-easing";
import { recordingElement } from "../../support/motion";

// The backdrop behind a moving element, as the bottom sheet's and the fullscreen viewer's black:
// it shows as the element does, and clears as the element goes out (DESIGN §4.3, §6.1). Node has no
// Web Animations, so the element and the backdrop record what they are given (motion.ts).

describe("backdropOpacity", () => {
  it("is the element's own opacity with it in place, and clears as it goes out", () => {
    expect(backdropOpacity(0, 600)).toBe(1);
    expect(backdropOpacity(150, 600)).toBe(0.75);
    expect(backdropOpacity(600, 600)).toBe(0);
    expect(backdropOpacity(150, 600, 0.5)).toBe(0.375);
  });

  it("stays full above its place and clear past its way out", () => {
    expect(backdropOpacity(-80, 600)).toBe(1);
    expect(backdropOpacity(-80, 600, 0.5)).toBe(0.5);
    expect(backdropOpacity(900, 600)).toBe(0);
  });

  it("is the element's own opacity before the element has a height", () => {
    expect(backdropOpacity(120, 0)).toBe(1);
    expect(backdropOpacity(120, 0, 0.4)).toBe(0.4);
  });
});

describe("showLook", () => {
  it("sets the element's translate, its opacity where the look has one, and the backdrop's", () => {
    const element = recordingElement(600);
    const backdrop = recordingElement(600);
    showLook(element.element, backdrop.element, { translate: "0 150px", backdrop: 0.75 });
    expect(element.style).toStrictEqual({ translate: "0 150px", opacity: "" });
    expect(backdrop.style.opacity).toBe("0.75");
    showLook(element.element, null, { translate: "0 0px", opacity: 0.5, backdrop: 0.5 });
    expect(element.style).toStrictEqual({ translate: "0 0px", opacity: "0.5" });
  });
});

describe("animateLook", () => {
  it("animates the element's translate and the backdrop's opacity on the easing, the element's first", () => {
    const element = recordingElement(600);
    const backdrop = recordingElement(600);
    const [moving, clearing] = animateLook(
      element.element,
      backdrop.element,
      { translate: "0 0px", backdrop: 1 },
      { translate: "0 600px", backdrop: 0 },
      GENTLE,
    );
    const timing = { duration: GENTLE.duration, easing: GENTLE.timingFunction };
    expect(moving).toBe(element.animations[0]);
    expect(clearing).toBe(backdrop.animations[0]);
    expect(element.animations[0]).toMatchObject({ keyframes: { translate: ["0 0px", "0 600px"] }, timing });
    expect(backdrop.animations[0]).toMatchObject({ keyframes: { opacity: [1, 0] }, timing });
  });

  it("fades the element only where both looks have an opacity, and animates no backdrop it lacks", () => {
    const element = recordingElement(600);
    const half = { translate: "0 0px", opacity: 0.5, backdrop: 0.5 };
    expect(
      animateLook(element.element, null, half, { translate: "0 0px", opacity: 1, backdrop: 1 }, GENTLE),
    ).toHaveLength(1);
    expect(element.animations[0]?.keyframes).toStrictEqual({ translate: ["0 0px", "0 0px"], opacity: [0.5, 1] });
    animateLook(element.element, null, half, { translate: "0 80px", backdrop: 1 }, GENTLE);
    expect(element.animations[1]?.keyframes).toStrictEqual({ translate: ["0 0px", "0 80px"] });
  });
});
