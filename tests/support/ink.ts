import type { Locator } from "@playwright/test";
import sharp from "sharp";

// Where an element draws its text, read from a screenshot of it without the caret: the columns its
// ink spans, and the side of the element the ink sits against. Ink is any pixel far from the
// element's background, which is sampled just inside its border.

/** How far a pixel's red, green and blue may stray in all from the background's before it is ink */
const INK_DISTANCE = 96;
/** The border, its rounding and their antialiasing, which the scan leaves out */
const EDGE = 3;

/** The first and last columns of ink, and the width of the element they sit in */
type Ink = { left: number; right: number; boxWidth: number };

/** The columns an element's ink spans, or null when it draws none, as an empty field without a placeholder */
export async function inkOf(element: Locator): Promise<Ink | null> {
  const png = await element.screenshot({ caret: "hide", animations: "disabled", scale: "css" });
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (x: number, y: number) => (y * info.width + x) * info.channels;
  const background = offset(EDGE, EDGE);
  const distance = (pixel: number) =>
    Math.abs((data[pixel] ?? 0) - (data[background] ?? 0)) +
    Math.abs((data[pixel + 1] ?? 0) - (data[background + 1] ?? 0)) +
    Math.abs((data[pixel + 2] ?? 0) - (data[background + 2] ?? 0));

  let left = Infinity;
  let right = -Infinity;
  for (let y = EDGE; y < info.height - EDGE; y++) {
    for (let x = EDGE; x < info.width - EDGE; x++) {
      if (distance(offset(x, y)) <= INK_DISTANCE) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  return Number.isFinite(left) ? { left, right, boxWidth: info.width } : null;
}

/** The side of the element its ink sits against, the one it leaves the narrower gap on, or none */
export function sideOf(ink: Ink | null): "left" | "right" | "none" {
  if (ink === null) return "none";
  return ink.left <= ink.boxWidth - 1 - ink.right ? "left" : "right";
}
