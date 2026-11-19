import { createContext, use } from "react";

// What a Field gives the control inside it (field.tsx): its id and ARIA links, so the label names it
// and a screen reader hears its error or its check, and the field's direction. A module of its own,
// so a control outside any field, as the 404's search, doesn't load the field's icons (D-049).

export type FieldControl = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  /** The field shows a check at the end of the control, which leaves it room */
  valid: boolean;
  /** The direction the field fixes, which the control takes as its own */
  dir?: "ltr" | "rtl";
};

export const FieldContext = createContext<FieldControl | null>(null);

/** The id and ARIA links of the field around a control, or nothing outside a field */
export function useFieldControl(): FieldControl | null {
  return use(FieldContext);
}
