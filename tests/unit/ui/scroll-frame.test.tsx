import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScrollFrame } from "@/components/ui/scroll-frame";

// DESIGN §7.2.3: a table wider than the screen scrolls in a frame of its own, which a keyboard reaches
// (WCAG 2.1.1)

describe("ScrollFrame", () => {
  it("is a named region that takes focus and scrolls sideways", () => {
    const html = renderToStaticMarkup(
      <ScrollFrame label="Formats" className="w-16">
        <table />
      </ScrollFrame>,
    );
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Formats"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('class="overflow-x-auto w-16"');
  });
});
