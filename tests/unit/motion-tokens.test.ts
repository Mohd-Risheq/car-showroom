import { readFileSync } from "node:fs";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cubicBezier, spring } from "motion";
import { describe, expect, it } from "vitest";
import "@/lib/motion/gsap";
import {
  CSS_MOTION_VARIABLES,
  cssEasing,
  type Curve,
  CURVES,
  DURATIONS,
  SCRUB_CATCH_UP,
  seconds,
  springPhysics,
  SPRINGS,
} from "@/lib/motion-tokens";
import { tokenBlocks } from "@/styles/token-blocks";

// SRS §11.8: src/lib/motion-tokens.ts is the one source of motion values, and src/styles/tokens.css
// and GSAP's chunk mirror it without forking. Every motion variable in the stylesheet must be one the
// module names, with the module's value, and every value the module names must be in the stylesheet.

const MOTION_VARIABLE = /^--(?:dur|ease|stagger|delay)(?:-|$)|^--press-scale$|^--pulse-cycles$/;

/** A time written as a number, as 1s or 250ms, rather than a token's variable */
const LITERAL_TIME = /(?<![\w.-])\d*\.?\d+m?s\b/;

/** Every variable tokens.css sets, as [block, name, value] */
function declarations(): Array<[block: string, name: string, value: string]> {
  const { blocks, problems } = tokenBlocks(readFileSync("src/styles/tokens.css", "utf8"));
  expect(problems).toEqual([]);
  return [...blocks].flatMap(([block, tokens]) =>
    [...tokens].map(([name, value]): [string, string, string] => [block, name, value]),
  );
}

/** The motion variables tokens.css sets, by name, from every block, a namespace reset aside */
function stylesheet(): Map<string, string> {
  const found = new Map<string, string>();
  for (const [block, name, value] of declarations()) {
    if (!MOTION_VARIABLE.test(name) || name.endsWith("*")) continue;
    expect(found.has(name), `${name} is set again in ${block}`).toBe(false);
    found.set(name, value);
  }
  return found;
}

describe("the motion tokens", () => {
  it("are mirrored in tokens.css exactly, with nothing there the module lacks", () => {
    expect(Object.fromEntries(stylesheet())).toEqual(Object.fromEntries(CSS_MOTION_VARIABLES));
  });

  it("time every animation the theme names, the spinner's turn included", () => {
    const animations = declarations().filter(([, name]) => name.startsWith("--animate-") && !name.endsWith("*"));
    expect(animations.length).toBeGreaterThan(0);
    for (const [, name, value] of animations) expect(value, name).not.toMatch(LITERAL_TIME);
  });

  it("write a curve as CSS does and convert milliseconds for Motion", () => {
    expect(cssEasing(CURVES.out)).toBe("cubic-bezier(0.23, 1, 0.32, 1)");
    expect(seconds(DURATIONS.modal)).toBe(0.25);
  });
});

describe("springPhysics", () => {
  it("gives every spring the curve Motion resolves its bounce and duration to, from rest", () => {
    for (const token of Object.values(SPRINGS)) {
      // Motion's generator takes its duration in milliseconds
      const timed = spring({ keyframes: [0, 1], bounce: token.bounce, duration: token.duration * 1000 });
      const physics = spring({ keyframes: [0, 1], ...springPhysics(token) });
      for (let ms = 0; ms < token.duration * 1000; ms += 5) {
        expect(Math.abs(physics.next(ms).value - timed.next(ms).value)).toBeLessThan(1e-3);
      }
    }
  });

  it("keeps a starting velocity, which Motion drops from a spring given by duration", () => {
    for (const token of Object.values(SPRINGS)) {
      const thrown = spring({ keyframes: [0, 1], velocity: 10, ...springPhysics(token) });
      const still = spring({ keyframes: [0, 1], ...springPhysics(token) });
      expect(thrown.next(30).value).toBeGreaterThan(still.next(30).value + 0.05);
    }
  });
});

describe("GSAP's chunk", () => {
  it("registers each curve as a CustomEase by its name, following the curve CSS draws", () => {
    for (const [name, curve] of Object.entries<Curve>(CURVES)) {
      const ease = gsap.parseEase(name);
      expect(ease, name).toBeTypeOf("function");
      // Motion's solver draws the curve as CSS's cubic-bezier() does
      const css = cubicBezier(...curve);
      for (let x = 0.05; x < 1; x += 0.05) {
        expect(Math.abs(ease(x) - css(x)), `${name} at ${x.toFixed(2)}`).toBeLessThan(1e-3);
      }
    }
  });

  it("gives every scroll trigger the scrub's catch-up, in seconds", () => {
    // Given nothing to set, defaults() returns what is set
    expect(ScrollTrigger.defaults({}).scrub).toBe(seconds(SCRUB_CATCH_UP));
  });
});
