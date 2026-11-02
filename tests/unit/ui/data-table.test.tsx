import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataTable } from "@/components/ui/data-table";

// The table of a reading page (src/components/ui/data-table.tsx): its frame has a name, each column
// and each row has its heading, and a row with a cell too many or too few stops the page's render,
// where it would otherwise put cells under the wrong headings.

const HEAD = ["Data", "Why", "Where"] as const;

describe("DataTable", () => {
  it("heads each column and each row, in a frame named for screen readers", () => {
    const markup = renderToStaticMarkup(
      <DataTable label="What the site keeps" head={HEAD} rows={[["Visit counts", "To learn", "The database"]]} />,
    );
    expect(markup).toMatch(/^<div [^>]*role="region" aria-label="What the site keeps" tabindex="0"/);
    expect(markup).toMatch(/(<th scope="col"[^>]*>\w+<\/th>){3}<\/tr><\/thead>/);
    expect(markup).toMatch(
      /<tr><th scope="row"[^>]*>Visit counts<\/th><td[^>]*>To learn<\/td><td[^>]*>The database<\/td><\/tr>/,
    );
  });

  it.each([
    ["too few", ["Visit counts", "To learn"]],
    ["too many", ["Visit counts", "To learn", "The database", "Indefinitely"]],
  ])("refuses a row with %s cells", (_, row) => {
    expect(() => renderToStaticMarkup(<DataTable label="What the site keeps" head={HEAD} rows={[row]} />)).toThrow(
      RangeError,
    );
  });
});
