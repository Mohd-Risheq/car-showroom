import { MagnifyingGlassPlusIcon } from "@phosphor-icons/react/ssr";
import { OUTLINE_CHIP } from "@/components/ui/chip-classes";
import { cn } from "@/lib/class-names";
import { closeupCount, type CloseupSource } from "../domain/evidence";
import { IMPERFECTIONS_ID } from "../domain/gallery";
import type { Translate } from "./translate";

// FR-09.13's evidence strip under the facts (DESIGN §7.2.3): a list labelled evidence.title of
// outline chips, as the gallery's group chips are, each a Phosphor icon and the evidence the car
// has, which links to where it shows. The chips wrap rather than scroll, and so do a chip's words on
// the narrowest screens, each chip 44 px tall at least. The close-ups' chip opens the gallery at its
// imperfection group (FR-09.13a), which the gallery follows from its fragment (photo-gallery.tsx).
// Each section's task adds its chip, or its evidence.none (FR-09.13b, D-049), so for now a car
// without a close-up has no strip (FR-09.13c, D-046). The server renders it, with no script.

/** An outline chip whose words wrap where its line is too short for them */
const CHIP = cn(OUTLINE_CHIP, "h-auto min-h-11 py-2 whitespace-normal");

export function EvidenceStrip({ car, t }: { car: CloseupSource; t: Translate }) {
  const closeups = closeupCount(car);
  if (closeups === 0) return null;
  return (
    <ul aria-label={t("evidence.title")} className="flex flex-wrap gap-2">
      <li>
        <a href={`#${IMPERFECTIONS_ID}`} className={CHIP}>
          <MagnifyingGlassPlusIcon aria-hidden="true" className="size-icon shrink-0" />
          {t("evidence.closeups", { count: closeups })}
        </a>
      </li>
    </ul>
  );
}
