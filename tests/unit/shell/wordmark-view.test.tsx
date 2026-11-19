import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Wordmark } from "@/features/shell/ui/wordmark";

// DESIGN §2 and §7.1.1: the header's start, a link home, with the dealer's logo or their name

describe("Wordmark", () => {
  it("draws the dealer's logo as a plain image, named by the dealer, which needs no script (D-049)", () => {
    const logo = { src: "/icon.svg", width: 32, height: 32 };
    const html = renderToStaticMarkup(<Wordmark href="/en" name="Muftah Motors" logo={logo} />);
    expect(html).toContain('<img src="/icon.svg" width="32" height="32" alt="Muftah Motors" class="h-8 w-auto"/>');
  });

  it("writes the dealer's name without a logo, sized by its length", () => {
    const html = renderToStaticMarkup(<Wordmark href="/en" name="Muftah Motors" logo={null} />);
    expect(html).toContain(
      '<span data-length="base" class="wordmark min-w-0 overflow-x-clip text-ellipsis">Muftah Motors</span>',
    );
    expect(html).not.toContain("<img");
  });
});
