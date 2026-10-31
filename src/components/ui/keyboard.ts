import { useSyncExternalStore } from "react";

// DESIGN §8.4: a bar fixed to the bottom of the screen, as a car page's action bar or the wizard's,
// and the English offer's card step aside while the on-screen keyboard is open, which is taken to
// be while a text field has focus and the visual viewport is under 500 px tall. The keyboard
// shrinks the visual viewport, and the bar or the card would cover much of what is left.

/** The fields a phone opens its keyboard for */
const TEXT_ENTRY = [
  "input:not([type])",
  ...["text", "search", "email", "tel", "url", "number", "password"].map((type) => `input[type="${type}"]`),
  "textarea",
  '[contenteditable]:not([contenteditable="false"])',
].join(", ");

/** The visual viewport's height, in CSS px, below which a focused text field means an open keyboard */
export const KEYBOARD_VIEWPORT_HEIGHT = 500;

/** Whether the keyboard is taken to be open, from the focused element and the visual viewport's height */
export function keyboardOpen(focused: Element | null, viewportHeight: number | undefined): boolean {
  if (focused === null || viewportHeight === undefined) return false;
  return viewportHeight < KEYBOARD_VIEWPORT_HEIGHT && focused.matches(TEXT_ENTRY);
}

/** Calls onChange whenever the keyboard may have opened or closed; returns the way to stop */
export function onKeyboardChange(onChange: () => void): () => void {
  const listeners = new AbortController();
  const { signal } = listeners;
  document.addEventListener("focusin", onChange, { signal });
  document.addEventListener("focusout", onChange, { signal });
  window.visualViewport?.addEventListener("resize", onChange, { signal });
  return () => listeners.abort();
}

/** Whether the keyboard is taken to be open now, by keyboardOpen's reading of the page */
export function keyboardOpenNow(): boolean {
  return keyboardOpen(document.activeElement, window.visualViewport?.height);
}

// The page's HTML always has the bar
const closedOnServer = () => false;

/** Whether the on-screen keyboard is open, by keyboardOpen's reading */
export function useKeyboardOpen(): boolean {
  return useSyncExternalStore(onKeyboardChange, keyboardOpenNow, closedOnServer);
}
