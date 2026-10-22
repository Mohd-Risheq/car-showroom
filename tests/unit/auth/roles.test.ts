import { describe, expect, it } from "vitest";
import { isUserRole } from "@/lib/auth/roles";

// SRS §4.2: the two dealer roles, matched exactly, since every role check reads this list

describe("isUserRole", () => {
  it.each(["owner", "staff"])("accepts %s", (role) => {
    expect(isUserRole(role)).toBe(true);
  });

  it.each([["Owner"], ["admin"], [""], [" staff"], [null], [undefined], [["owner"]]])("refuses %j", (value) => {
    expect(isUserRole(value)).toBe(false);
  });
});
