"use client";

import { CircleNotchIcon } from "@phosphor-icons/react/ssr";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { cn } from "@/lib/class-names";
import { buttonClasses } from "./button-classes";

// A button on DESIGN §6.4's states (button-classes.ts).

type Common = Omit<ComponentProps<"button">, "children" | "disabled"> & {
  variant?: NonNullable<VariantProps<typeof buttonClasses>["variant"]>;
  /** At 40% and inert, yet still focusable, so a screen reader finds it and whatever explains why */
  disabled?: boolean;
};

/**
 * A label, and an icon before it. A button that can be busy has an icon, because the spinner takes
 * the icon's place: the label stays and the width never changes (DESIGN §6.4).
 */
type LabelButton = Common & { size?: "default" | "compact"; children: ReactNode } & (
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
