import type { KeyPress } from "@/features/car-page/domain/gallery";
import type { PointerAt } from "@/features/car-page/domain/stage-gesture";

// What the unit tests of the car page's gallery and its fullscreen viewer give its gestures and its
// keys: a phone's screen, a pointer as px from the screen's middle, and a key's press.

/** A phone's screen, which the viewer fills */
export const PHONE = { width: 360, height: 780 };

/** A pointer at px from the screen's middle, at a time in ms */
export const at = (id: number, x: number, y: number, time = 0): PointerAt => ({ id, x, y, time });

/** A press of the key, held with no other unless one is given */
export const press = (key: string, held: Partial<Omit<KeyPress, "key">> = {}): KeyPress => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...held,
});
