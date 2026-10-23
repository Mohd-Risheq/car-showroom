import type { ComponentProps, MouseEvent, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";

// DESIGN §6.4: a disabled or busy button stays in the tab order, says why it is inert, and does
// nothing when pressed, a form's submit included

/** A press on the button as React hands it to onClick; returns the event's preventDefault */
function press(button: ReactElement<ComponentProps<"button">>) {
  const preventDefault = vi.fn();
  button.props.onClick?.({ preventDefault } as unknown as MouseEvent<HTMLButtonElement>);
  return preventDefault;
}

const icon = <svg />;

describe("Button", () => {
  it("does nothing on a press while busy or disabled", () => {
    for (const state of [{ loading: true }, { disabled: true }]) {
      const onClick = vi.fn();
      const preventDefault = press(Button({ icon, onClick, children: "Save", ...state }));
      expect(onClick, JSON.stringify(state)).not.toHaveBeenCalled();
      expect(preventDefault, JSON.stringify(state)).toHaveBeenCalledOnce();
    }
  });

  it("passes any other press on", () => {
    const onClick = vi.fn();
    const preventDefault = press(Button({ icon, onClick, children: "Save" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("stays focusable while inert, and says when it is busy", () => {
    const busy = renderToStaticMarkup(
      <Button icon={icon} loading>
        Save
      </Button>,
    );
    expect(busy).toContain('aria-disabled="true"');
    expect(busy).toContain('aria-busy="true"');
    const sold = renderToStaticMarkup(<Button disabled>Sold</Button>);
    expect(sold).toContain('aria-disabled="true"');
    expect(sold).not.toContain("aria-busy");
    // No disabled attribute, which would take the button out of the tab order
    for (const markup of [busy, sold]) expect(markup).not.toMatch(/\sdisabled[\s=>]/);
  });
});
