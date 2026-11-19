import type { PanelState } from "@/lib/db/enums";
import type { PublicPanel, PublicPhoto } from "@/lib/db/public-dto";

// FR-09.13's evidence strip (DESIGN §7.2.3), built only from data the car already has. The
// close-ups are the photos of its panels that aren't original, which the strip counts and links to
// in the gallery's imperfection group (FR-09.13a), so it counts those in that group alone: the link
// then always opens on each one it counts, where a close-up the dealer filed elsewhere still shows
// in the gallery. A photo of two panels counts once. A car without one has no chip (FR-09.13c,
// D-046).

/** The states of a panel that isn't original: BR-09's replaced, repainted and touch-ups */
const NOT_ORIGINAL: ReadonlySet<PanelState> = new Set(["replaced", "repainted", "touch_up"]);

/** What of the car its close-ups are counted from */
export type CloseupSource = {
  readonly photos: readonly Pick<PublicPhoto, "id" | "group">[];
  readonly inspection: { readonly panels: readonly Pick<PublicPanel, "state" | "closeupPhotoId">[] } | null;
};

/** How many close-ups of the panels that aren't original the gallery's imperfection group holds */
export function closeupCount({ photos, inspection }: CloseupSource): number {
  const imperfections = new Set(photos.filter(({ group }) => group === "imperfection").map(({ id }) => id));
  const closeups = new Set<string>();
  for (const { state, closeupPhotoId } of inspection?.panels ?? []) {
    if (closeupPhotoId !== null && NOT_ORIGINAL.has(state) && imperfections.has(closeupPhotoId)) {
      closeups.add(closeupPhotoId);
    }
  }
  return closeups.size;
}
