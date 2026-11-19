import type { ComponentProps, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, it } from "vitest";
import { ActionBar } from "@/features/shell/ui/action-bar";

// FR-02.2's action bar (DESIGN §7.1.1): a price at its start and the actions at its end, or, without
// a price, as a sold car's bar has none, the actions across its width (D-049). T-23 fills it.

const ACTIONS = <button type="button">Call</button>;

describe("the action bar", () => {
  it("holds a price at its start and the actions at its end", () => {
    expect(renderToStaticMarkup(<ActionBar price={<b>48,500</b>} actions={ACTIONS} />)).toContain(
      '<div class="min-w-0"><b>48,500</b></div><div class="flex items-center gap-2 shrink-0">',
    );
  });

  it("gives its actions its width without a price, left out or undefined", () => {
    const bars = [
      <ActionBar key="left out" actions={ACTIONS} />,
      <ActionBar key="undefined" price={undefined} actions={ACTIONS} />,
    ];
    for (const bar of bars) {
      const html = renderToStaticMarkup(bar);
      expect(html, bar.key ?? "").not.toContain('class="min-w-0"');
      expect(html, bar.key ?? "").toContain('<div class="flex items-center gap-2 flex-1 *:flex-1">');
    }
  });

  it("takes a price as an element, so a choice that comes to null or false is a type error, not an empty start", () => {
    expectTypeOf<ComponentProps<typeof ActionBar>["price"]>().toEqualTypeOf<ReactElement | undefined>();
  });
});
