import type { Easing } from "./release-easing";

// How an element that moves over a backdrop shows and animates, as the bottom sheet and the
// fullscreen viewer's photos do (sheet-motion.ts, track-motion.ts): the element's translate, its
// opacity where it fades, and the backdrop's opacity, which clears as the element goes away. Every
// change runs on the Web Animations API, off the main thread (DESIGN §4.1).

/** What shows: the element's translate, its opacity where it fades, and the backdrop's opacity */
export type Look = { readonly translate: string; readonly opacity?: number; readonly backdrop: number };

/**
 * The backdrop's opacity for an element `offset` px on its way out of `height`: the element's own
 * opacity in place, clear once it is all the way out
 */
export function backdropOpacity(offset: number, height: number, opacity = 1): number {
  if (height <= 0) return opacity;
  return opacity * Math.min(Math.max(1 - offset / height, 0), 1);
}

/** Shows a look at once */
export function showLook(element: HTMLElement, backdrop: HTMLElement | null, look: Look): void {
  element.style.translate = look.translate;
  if (look.opacity !== undefined) element.style.opacity = String(look.opacity);
  if (backdrop) backdrop.style.opacity = String(look.backdrop);
}

/**
 * Animates from one look to another with an easing. The caller shows the end first (showLook): the
 * animations show the way there, and leave it when they end. Returns them, the element's first.
 */
export function animateLook(
  element: HTMLElement,
  backdrop: HTMLElement | null,
  from: Look,
  to: Look,
  easing: Easing,
): readonly [Animation, ...Animation[]] {
  const timing = { duration: easing.duration, easing: easing.timingFunction };
  const keyframes: PropertyIndexedKeyframes = { translate: [from.translate, to.translate] };
  if (from.opacity !== undefined && to.opacity !== undefined) keyframes.opacity = [from.opacity, to.opacity];
  const moving = element.animate(keyframes, timing);
  return backdrop ? [moving, backdrop.animate({ opacity: [from.backdrop, to.backdrop] }, timing)] : [moving];
}
