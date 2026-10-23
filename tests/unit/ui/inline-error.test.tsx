import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InlineError } from "@/components/ui/inline-error";

// SRS §10.4 (4.1.3): errors use assertive live regions only when they block

function render(blocking: boolean): string {
  return renderToStaticMarkup(
    <InlineError blocking={blocking} retry={<button type="button">Try again</button>}>
      The cars failed to load.
    </InlineError>,
  );
}

describe("InlineError", () => {
  it("interrupts a screen reader only for an error that blocks", () => {
    expect(render(true)).toContain('role="alert"');
    expect(render(false)).not.toContain("role=");
  });
});
