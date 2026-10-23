import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// DESIGN §6.4 and §8.5: the label names the control, the hint sits under the label, and the control
// tells a screen reader about the error or the valid value, then the hint

/** A field around an input, as server-rendered HTML */
function render(field: Omit<ComponentProps<typeof Field>, "children">, input: ComponentProps<typeof Input> = {}) {
  return renderToStaticMarkup(
    <Field {...field}>
      <Input {...input} />
    </Field>,
  );
}

/** An attribute of the first element with the tag */
function attribute(markup: string, tag: string, name: string): string | undefined {
  const element = new RegExp(`<${tag}\\b[^>]*>`).exec(markup)?.[0] ?? "";
  return new RegExp(`\\s${name}="([^"]*)"`).exec(element)?.[1];
}

/** The text of each element the input's aria-describedby names, in order */
function descriptions(markup: string): Array<string | undefined> {
  const ids = attribute(markup, "input", "aria-describedby")?.split(" ") ?? [];
  return ids.map((id) =>
    new RegExp(`<(\\w+)[^>]*\\sid="${id}"[^>]*>(.*?)</\\1>`).exec(markup)?.[2]?.replace(/<[^>]*>/g, ""),
  );
}

describe("Field", () => {
  it("names the error, then the hint, and marks the control invalid", () => {
    const markup = render({ label: "VIN", description: "17 letters and digits", error: "Check the 9th character" });
    expect(descriptions(markup)).toEqual(["Check the 9th character", "17 letters and digits"]);
    expect(attribute(markup, "input", "aria-invalid")).toBe("true");
  });

  it("lets a screen reader hear that the value checks out, which the check only shows", () => {
    const markup = render({ label: "VIN", description: "17 letters and digits", valid: "The check digit matches" });
    expect(descriptions(markup)).toEqual(["The check digit matches", "17 letters and digits"]);
    expect(markup).toContain("<svg");
  });

  it("drops the valid message and the check while the field has an error", () => {
    const markup = render({ label: "VIN", error: "Check the 9th character", valid: "The check digit matches" });
    expect(descriptions(markup)).toEqual(["Check the 9th character"]);
    expect(markup).not.toContain("The check digit matches");
  });

  it("puts the hint under the label, above the control", () => {
    const markup = render({ label: "Price", description: "In dinars" });
    expect(markup.indexOf("<label")).toBeLessThan(markup.indexOf("In dinars"));
    expect(markup.indexOf("In dinars")).toBeLessThan(markup.indexOf("<input"));
  });

  it("takes the id a form gives it, so the form can link to the field", () => {
    const markup = render({ id: "price", label: "Price" });
    expect(attribute(markup, "label", "for")).toBe("price");
    expect(attribute(markup, "input", "id")).toBe("price");
  });

  it("keeps its label on the control when the control is given an id", () => {
    const markup = render({ label: "Price" }, { id: "x" });
    expect(attribute(markup, "input", "id")).toBeTruthy();
    expect(attribute(markup, "label", "for")).toBe(attribute(markup, "input", "id"));
  });
});
