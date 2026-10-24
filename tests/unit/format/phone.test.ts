import { describe, expect, it } from "vitest";
import { formatPhone } from "@/lib/format/phone";

// DESIGN §9.4: a stored E.164 number (VR-20) shows grouped, "+962 79 123 4567"

describe("formatPhone", () => {
  it.each([
    ["+962791234567", "+962 79 123 4567"],
    ["+962771234567", "+962 77 123 4567"],
    ["+962781234567", "+962 78 123 4567"],
    ["+96261234567", "+962 6 123 4567"],
    ["+96221234567", "+962 2 123 4567"],
    ["+96231234567", "+962 3 123 4567"],
    ["+96251234567", "+962 5 123 4567"],
  ])("groups the Jordanian number %s as %s", (stored, shown) => {
    expect(formatPhone(stored)).toBe(shown);
  });

  // Another country's number, or one Jordan doesn't give out, has no grouping the site knows
  it.each(["+447911123456", "+962711234567", "+9627912345678", "+96279123456", "+96241234567", "+96281234567"])(
    "shows %s as stored",
    (stored) => {
      expect(formatPhone(stored)).toBe(stored);
    },
  );
});
