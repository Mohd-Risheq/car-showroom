import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fillSlot, SLOT } from "@/lib/i18n/slot";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";

// A message's values are text (next-intl), so markup that sits inside a sentence, such as a reference
// code in Martian Mono (DESIGN §9.5), goes in as SLOT, and fillSlot puts the markup in its place

describe("fillSlot", () => {
  it("puts the markup where the message holds the slot", () => {
    const html = renderToStaticMarkup(<p>{fillSlot(`Ref. ${SLOT}`, <bdi dir="ltr">MU-3HK8</bdi>)}</p>);
    expect(html).toBe('<p>Ref. <bdi dir="ltr">MU-3HK8</bdi></p>');
  });

  it("keeps the message's text on both sides of it", () => {
    const html = renderToStaticMarkup(<p>{fillSlot(`Battery health ${SLOT}%`, <span>91</span>)}</p>);
    expect(html).toBe("<p>Battery health <span>91</span>%</p>");
  });

  it("refuses a message without the slot, or with it twice, which would lose the markup or repeat it", () => {
    expect(() => fillSlot("Ref.", <b />)).toThrow(/once/);
    expect(() => fillSlot(`${SLOT} and ${SLOT}`, <b />)).toThrow(/once/);
  });

  it("is a character no catalog message holds", () => {
    for (const catalog of [ar, en]) expect(JSON.stringify(catalog)).not.toContain(SLOT);
  });
});
