"use client";

import { CheckIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { createContext, type ReactNode, use, useId } from "react";
import { cn } from "@/lib/class-names";

// A form control with its label, hint and error (DESIGN §6.4 and §8.5). The control inside reads its
// id and ARIA links from here (useFieldControl), so the label names it and a screen reader hears the
// error, or that the value checks out, and then the hint when it takes focus.

type FieldControl = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  /** The field shows a check at the end of the control, which leaves it room */
  valid: boolean;
};

const FieldContext = createContext<FieldControl | null>(null);

/** The id and ARIA links of the field around a control, or nothing outside a field */
export function useFieldControl(): FieldControl | null {
  return use(FieldContext);
}

type FieldProps = {
  /** The control's id, for a form that links to its fields; one is made up otherwise */
  id?: string;
  label: ReactNode;
  /** A hint under the label */
  description?: ReactNode;
  /** What is wrong and what to do about it, under the control in --fail with an icon */
  error?: ReactNode;
  /**
   * That the value checks out, where saying so helps, as with a VIN whose check digit matches
   * (DESIGN §6.4). The control shows a check, and a screen reader hears this instead.
   */
  valid?: ReactNode;
  /**
   * The control's direction when it differs from the page's, as a VIN or a plate reads left to right
   * in Arabic too. The check then sits at the end of the value, where the control leaves it room.
   */
  dir?: "ltr" | "rtl";
  className?: string;
  children: ReactNode;
};

export function Field({ id: givenId, label, description, error, valid, dir, className, children }: FieldProps) {
  const madeId = useId();
  const id = givenId ?? madeId;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const validId = `${id}-valid`;
  const invalid = Boolean(error);
  const checked = Boolean(valid) && !invalid;
  // The state first, so the error or the check is heard before the hint
  const describedBy = [invalid ? errorId : checked ? validId : null, description ? descriptionId : null]
    .filter(Boolean)
    .join(" ");

  const control: FieldControl = {
    id,
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
    ...(invalid ? { "aria-invalid": true } : {}),
    valid: checked,
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <label htmlFor={id}>{label}</label>
      {description ? (
        <p id={descriptionId} className="text-sm text-muted public:type-small">
          {description}
        </p>
      ) : null}
      <div className="relative" dir={dir}>
        <FieldContext value={control}>{children}</FieldContext>
        {checked ? (
          <CheckIcon
            aria-hidden="true"
            className="pointer-events-none absolute end-3 top-1/2 size-icon -translate-y-1/2 text-accent"
          />
        ) : null}
      </div>
      {checked ? (
        <p id={validId} className="sr-only">
          {valid}
        </p>
      ) : null}
      {invalid ? (
        <p id={errorId} className="flex items-start gap-2 text-sm text-fail public:type-small">
          <WarningCircleIcon aria-hidden="true" className="size-icon shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
