import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { nearViewport } from "@/features/car-page/ui/near-viewport";

// FR-09.7: a section's island, its interactive part, loads its code only once the section comes
// within one viewport of the screen, so the server renders what stands in the island's place, the
// section's static form or a skeleton, and never loads the island

describe("a section's island", () => {
  it("is its stand-in on the server, which never loads the island's code", () => {
    const load = vi.fn(() => Promise.resolve({ default: ({ label }: { label: string }) => <p>{label}</p> }));
    const Island = nearViewport(load, "SECTION_LAB");
    const html = renderToStaticMarkup(
      <Island island={{ label: "The island" }} failure="Couldn't load this part.">
        <p>The static form</p>
      </Island>,
    );
    expect(html).toBe("<div><p>The static form</p></div>");
    expect(load).not.toHaveBeenCalled();
  });
});
