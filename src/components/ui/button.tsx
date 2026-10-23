"use client";

import { CircleNotchIcon } from "@phosphor-icons/react/ssr";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { cn } from "@/lib/class-names";

// DESIGN §6.4's button states on the tokens: hover on a fine pointer only (--surface-3, or 6%
// brighter for the filled button), the press scale (pressable), the focus ring (globals.css),
// disabled at 40% and loading. Buttons are fully round (DESIGN §3.5) and 44 px high, the primary
// target size (DESIGN §8.4).

/** A button's classes, for a link that looks like a button */
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
        /** The icon alone, for the universally known controls (DESIGN §3.6) */
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

type Common = Omit<ComponentProps<"button">, "children" | "disabled"> & {
  variant?: NonNullable<VariantProps<typeof buttonClasses>["variant"]>;
  /** At 40% and inert, yet still focusable, so a screen reader finds it and whatever explains why */
  disabled?: boolean;
};

/**
 * A label, and an icon before it. A button that can be busy has an icon, because the spinner takes
 * the icon's place: the label stays and the width never changes (DESIGN §6.4).
 */
type LabelButton = Common & { size?: "default"; children: ReactNode } & (
    { icon: ReactElement; loading?: boolean } | { icon?: undefined; loading?: undefined }
  );

/** An icon alone, named by aria-label (DESIGN §3.6) */
type IconButton = Common & {
  size: "icon";
  "aria-label": string;
  /** The icon */
  children: ReactElement;
  icon?: undefined;
  loading?: boolean;
};

export type ButtonProps = LabelButton | IconButton;

/** A button. type is "button" unless the caller says otherwise, so a form submits only on purpose. */
export function Button({
  variant,
  size,
  icon,
  loading = false,
  disabled = false,
  type = "button",
  className,
  onClick,
  children,
  ...props
}: ButtonProps) {
  // aria-disabled rather than disabled, so the button keeps its place in the tab order. A press on
  // a disabled or busy button does nothing, including a form's submit.
  const inert = disabled || loading;
  const glyph = loading ? <CircleNotchIcon className="size-4 animate-spin" /> : size === "icon" ? children : icon;

  return (
    <button
      {...props}
      type={type}
      aria-disabled={inert || undefined}
      aria-busy={loading || undefined}
      data-disabled={disabled || undefined}
      className={cn(buttonClasses({ variant, size }), className)}
      onClick={(event) => {
        if (inert) event.preventDefault();
        else onClick?.(event);
      }}
    >
      {glyph === undefined ? null : (
        <span
          aria-hidden="true"
          className="flex size-icon shrink-0 items-center justify-center text-(length:--spacing-icon)"
        >
          {glyph}
        </span>
      )}
      {size === "icon" ? null : children}
    </button>
  );
}
