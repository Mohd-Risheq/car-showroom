import { describe, expect, it } from "vitest";
import { workflowCommand } from "../../../scripts/checks/github.ts";

// A GitHub Actions workflow command, which the run shows as an annotation: its title and text are
// escaped as the Actions toolkit escapes them, so a line break or a colon can't end either early

describe("workflowCommand", () => {
  it("writes the level, the title and the text", () => {
    expect(workflowCommand("notice", "Lighthouse /ar", "performance 0.88")).toBe(
      "::notice title=Lighthouse /ar::performance 0.88",
    );
    expect(workflowCommand("error", "Lighthouse /en", "no report")).toBe("::error title=Lighthouse /en::no report");
  });

  it("escapes a percent sign and line breaks in both, and a colon and a comma in the title", () => {
    expect(workflowCommand("notice", "a: b, 5%\n", "50% of a\r\nb: c, d")).toBe(
      "::notice title=a%3A b%2C 5%25%0A::50%25 of a%0D%0Ab: c, d",
    );
  });
});
