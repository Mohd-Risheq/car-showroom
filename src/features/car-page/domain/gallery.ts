import { PHOTO_GROUPS, type PhotoGroup } from "@/lib/db/enums";

// FR-10's gallery on the page (DESIGN §7.2.3): the photo groups, which act as quick filters, the
// desktop rail's thumbnails, the arrow keys, which step through the photos in the reading direction
// (FR-10.3), and the link to the imperfection group (FR-09.13a). Pure, so the gallery, its viewer
// and the page's links to it read each the same way.

/** The imperfection group's link (FR-09.13a): the gallery's id, where the car has photos in it */
export const IMPERFECTIONS_ID = "photos-imperfection";

/** A group that has photos, and how many */
type GroupCount = { readonly group: PhotoGroup; readonly count: number };

/** The groups the photos fall in, in FR-10's order: Exterior, Interior, Engine bay, Imperfections */
export function photoGroupsOf(photos: readonly { readonly group: PhotoGroup }[]): GroupCount[] {
  return PHOTO_GROUPS.map((group) => ({ group, count: photos.filter((photo) => photo.group === group).length })).filter(
    ({ count }) => count > 0,
  );
}

/** The group's photos in the dealer's order, or every photo with no group chosen */
export function inGroup<P extends { readonly group: PhotoGroup }>(
  photos: readonly P[],
  group: PhotoGroup | null,
): readonly P[] {
  return group === null ? photos : photos.filter((photo) => photo.group === group);
}

/** The rail's thumbnails before its tile for the rest (DESIGN §7.2.3) */
const RAIL_THUMBNAILS = 6;

/**
 * The desktop rail for a number of photos: none for one photo (DESIGN §10.3), every photo up to
 * seven, and past seven six thumbnails and a tile that counts the rest, as +18 for 24 and +34 for 40
 */
export function railOf(count: number): { thumbnails: number; more: number } {
  if (count <= 1) return { thumbnails: 0, more: 0 };
  if (count <= RAIL_THUMBNAILS + 1) return { thumbnails: count, more: 0 };
  return { thumbnails: RAIL_THUMBNAILS, more: count - RAIL_THUMBNAILS };
}

/** A key press, as a keyboard event tells it */
export type KeyPress = {
  readonly key: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
};

/**
 * The side the next photo waits on, as a sign across the screen: the right in English, 1, and the
 * left in Arabic, -1, as the reading direction runs (DESIGN §4.6). The arrow keys, a swipe and the
 * fullscreen viewer's photos all take it from here.
 */
export function nextSide(dir: "rtl" | "ltr"): 1 | -1 {
  return dir === "rtl" ? -1 : 1;
}

/** The arrow keys across, as a sign across the screen */
const ARROWS_ACROSS = new Map([
  ["ArrowRight", 1],
  ["ArrowLeft", -1],
]);

/**
 * An arrow key's step through the photos: on with the arrow that points at the side the next photo
 * waits on, so ArrowLeft in Arabic. An arrow held with Alt, Ctrl or Cmd is the browser's or the
 * system's, as Alt+ArrowLeft is Back.
 */
export function stepFromKey({ key, altKey, ctrlKey, metaKey }: KeyPress, dir: "rtl" | "ltr"): -1 | 0 | 1 {
  const side = ARROWS_ACROSS.get(key);
  if (side === undefined || altKey || ctrlKey || metaKey) return 0;
  return side === nextSide(dir) ? 1 : -1;
}

/** The photo a step leads to: it stops at the first photo and the last */
export function stepTo(index: number, step: number, count: number): number {
  return Math.min(Math.max(index + step, 0), count - 1);
}

/** Whether a photo waits each way of the one in view, which a step or a swipe could bring in */
export function photosBeside(index: number, count: number): { readonly previous: boolean; readonly next: boolean } {
  return { previous: index > 0, next: index < count - 1 };
}

/** A click, as a mouse event tells it */
type Click = {
  readonly button: number;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly defaultPrevented: boolean;
};

/**
 * Whether a click follows its link on the page: with the main button, as a press of Enter makes it,
 * and no key held, as the browser opens a link elsewhere or saves it for one, unless a handler of
 * its own took it
 */
export const followsOnPage = ({ button, altKey, ctrlKey, metaKey, shiftKey, defaultPrevented }: Click) =>
  button === 0 && !(altKey || ctrlKey || metaKey || shiftKey || defaultPrevented);
