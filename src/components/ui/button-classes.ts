import { cva } from "class-variance-authority";

// DESIGN §6.4's button states on the tokens: hover on a fine pointer only (--surface-3, or 6%
// brighter for the filled button), the press scale (pressable), the focus ring (globals.css),
// disabled at 40% and loading. Buttons are fully round (DESIGN §3.5) and 44 px high, the primary
// target size (DESIGN §8.4). Kept apart from button.tsx, a client module, so a server component can
// style a link with them.

/** A button's classes, also for a link that looks like a button */
export const buttonClasses = cva(
  "pressable inline-flex shrink-0 items-center justify-center gap-2 rounded-full whitespace-nowrap select-none data-disabled:opacity-40",
  {
    variants: {
      variant: {
        /** The one filled button of a view, in the accent */
        primary: "bg-accent text-on-accent hover:not-aria-disabled:brightness-106",
        /** The round outline button */
        secondary: "border border-line text-ink hover:not-aria-disabled:bg-surface-3",
        /** No outline: an action beside a primary one */
        quiet: "text-ink hover:not-aria-disabled:bg-surface-3",
      },
      size: {
        default: "h-11 px-5",
        /** Inside a band under 44 px, as the demo banner's Hide: 32 px, above WCAG 2.5.8's 24 px */
        compact: "h-8 px-3",
        /** The icon alone, for the universally known controls (DESIGN §3.6) */
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);
