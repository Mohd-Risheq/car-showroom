import { cn } from "@/lib/class-names";
import { buttonClasses } from "./button-classes";

// DESIGN §3.5's chips. The filled chip is a label rather than a control: fully round on --surface-3,
// its words on one line, with the edge a surface gains under increased contrast and forced colours
// (DESIGN §4.5), as the price's Price dropped badge and the viewer's Imperfection chip are. Each sets
// its own type step and colour. The outline chip is a control, the round outline button with its
// words at the small step (DESIGN §6.4), as the gallery's group chips and the evidence strip's are,
// and a toggle chip, once pressed, is filled in --ink with its words and its tick in the page's
// ground, under the pointer too.

/** A filled chip's classes */
export const FILLED_CHIP = "whitespace-nowrap rounded-full bg-surface-3 px-3 py-1 surface-edge";

/** An outline chip's classes */
export const OUTLINE_CHIP = cn(buttonClasses(), "px-4 type-small");

/** A toggle chip's classes, as its aria-pressed shows it */
export const TOGGLE_CHIP = cn(
  OUTLINE_CHIP,
  "aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-bg hover:not-aria-disabled:aria-pressed:bg-ink",
);
