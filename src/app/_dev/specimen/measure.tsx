"use client";

// What the browser computes for the element just before this one, or for the one around it when it
// comes first, so a specimen's label shows what the tokens produce rather than a copy of them
// (Phase 0 review C1#9). Custom properties inherit, so any element shows the token it sits under.
// It reads again when an attribute on <html> changes, as the workspace theme does, when the window
// is resized, since sizes and the display step's HEXP follow its width, and when one of the
// preferences DESIGN §4.5 answers changes while the page is open.

const PREFERENCES = [
  "(prefers-reduced-motion: reduce)",
  "(prefers-contrast: more)",
  "(prefers-reduced-transparency: reduce)",
];

type MeasureProps = {
  /** CSS properties, custom ones included, read in this order */
  properties: readonly string[];
  /** Colours as #rrggbb rather than as the browser writes them */
  colour?: boolean;
};

export function Measure({ properties, colour = false }: MeasureProps) {
  return (
    <span
      dir="ltr"
      className="font-mono text-xs text-muted"
      data-measure
      ref={(element) => {
        const target = element?.previousElementSibling ?? element?.parentElement;
        if (!element || !target) return;
        const read = () => {
          const style = getComputedStyle(target);
          element.textContent = properties
            .map((property) => {
              const value = style.getPropertyValue(property).trim();
              return colour ? hex(value) : value;
            })
            .join(" · ");
        };
        read();
        const observer = new MutationObserver(read);
        observer.observe(document.documentElement, { attributes: true });
        const preferences = PREFERENCES.map((query) => matchMedia(query));
        for (const preference of preferences) preference.addEventListener("change", read);
        window.addEventListener("resize", read);
        return () => {
          observer.disconnect();
          for (const preference of preferences) preference.removeEventListener("change", read);
          window.removeEventListener("resize", read);
        };
      }}
    />
  );
}

/** rgb() or rgba() as #rrggbb, with the alpha after it when it isn't 1 */
function hex(colour: string): string {
  const parts = colour.startsWith("rgb") ? colour.match(/[\d.]+/g)?.map(Number) : undefined;
  if (!parts || parts.length < 3) return colour;
  const [red = 0, green = 0, blue = 0, alpha = 1] = parts;
  const code = `#${[red, green, blue].map((part) => Math.round(part).toString(16).padStart(2, "0")).join("")}`;
  return alpha === 1 ? code : `${code} at ${Math.round(alpha * 100)}%`;
}
