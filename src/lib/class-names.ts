import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Class names for the components (DESIGN §6.1): clsx joins them and tailwind-merge drops an earlier
// class that a later one replaces, so a caller's className wins over a component's own. The theme
// below is src/styles/tokens.css's, whose namespaces start empty: tailwind-merge has to know the
// token names to see that p-page replaces p-4, that a type-* step sets the family, size, line
// height and weight that a font-* or text-* class would, and that figures set the family and weight.
const mergeClasses = extendTailwindMerge<"type-step" | "figures">({
  override: {
    theme: {
      animate: ["spin", "skeleton"],
      aspect: ["card", "hero"],
      blur: [],
      breakpoint: ["sm", "md", "lg", "xl"],
      container: ["content", "measure"],
      "drop-shadow": [],
      ease: ["out", "in-out", "drawer"],
      font: ["sans", "lead", "head", "display", "figures", "mono"],
      "font-weight": ["normal", "medium", "semibold"],
      "inset-shadow": [],
      leading: [],
      perspective: ["none"],
      radius: ["input"],
      shadow: ["overlay"],
      text: ["xs", "sm", "base", "lg", "xl", "2xl"],
      "text-shadow": [],
      tracking: [],
    },
  },
  extend: {
    theme: { spacing: ["page", "gutter", "section", "icon", "icon-lg"] },
    classGroups: { "type-step": [{ type: ["display", "head", "lead", "body", "small"] }], figures: ["figures"] },
    conflictingClassGroups: {
      "type-step": ["font-family", "font-size", "leading", "tracking", "font-weight", "text-wrap"],
      // Figures take the size of the step around them
      figures: ["font-family", "font-weight"],
    },
  },
});

/** The classes joined, a later Tailwind class replacing an earlier one that sets the same thing */
export function cn(...classes: ClassValue[]): string {
  return mergeClasses(clsx(classes));
}
