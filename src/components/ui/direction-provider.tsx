"use client";

import { DirectionProvider as BaseUiDirection } from "@base-ui/react/direction-provider";
import { Direction } from "radix-ui";
import type { ReactNode } from "react";

// DESIGN §6.1: the primitives take the reading direction from the locale. Radix and Base UI read it
// from React context rather than from <html dir>, for arrow keys, sliders and where a popup opens.

type DirectionProviderProps = { dir: "rtl" | "ltr"; children: ReactNode };

export function DirectionProvider({ dir, children }: DirectionProviderProps) {
  return (
    <Direction.Provider dir={dir}>
      <BaseUiDirection direction={dir}>{children}</BaseUiDirection>
    </Direction.Provider>
  );
}
