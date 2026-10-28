import { describe, expect, it } from "vitest";
import { ownerInput } from "../../../scripts/checks/owner-input.ts";

// What scripts/create-owner.ts reads from the environment (SRS §6.4, §15.1)

const ENVIRONMENT = { DEALER_SLUG: "muftah", OWNER_EMAIL: "abu.fadi@muftah.example", OWNER_NAME: "Abu Fadi" };

describe("ownerInput", () => {
  it("reads the dealer, the address and the name", () => {
    expect(ownerInput(ENVIRONMENT)).toStrictEqual({
      input: { dealerSlug: "muftah", email: "abu.fadi@muftah.example", name: "Abu Fadi" },
    });
  });

  it("trims each value, and lowercases the address as the auth library stores it", () => {
    const read = ownerInput({
      DEALER_SLUG: " muftah ",
      OWNER_EMAIL: " Abu.Fadi@Muftah.EXAMPLE ",
      OWNER_NAME: " Abu Fadi ",
    });
    expect(read).toStrictEqual({ input: { dealerSlug: "muftah", email: "abu.fadi@muftah.example", name: "Abu Fadi" } });
  });

  it("names each variable that's missing or empty", () => {
    expect(ownerInput({ DEALER_SLUG: "muftah", OWNER_NAME: "  " })).toStrictEqual({
      problems: ["OWNER_EMAIL: validation.required", "OWNER_NAME: validation.required"],
    });
  });

  it("refuses an address VR-22 refuses, a name past 100 characters and one that can't be printed", () => {
    expect(ownerInput({ ...ENVIRONMENT, OWNER_EMAIL: "abu.fadi" })).toStrictEqual({
      problems: ["OWNER_EMAIL: validation.email"],
    });
    expect(ownerInput({ ...ENVIRONMENT, OWNER_NAME: "A".repeat(100) })).toHaveProperty("input.name", "A".repeat(100));
    expect(ownerInput({ ...ENVIRONMENT, OWNER_NAME: "A".repeat(101) })).toStrictEqual({
      problems: ["OWNER_NAME: validation.maxChars"],
    });
    expect(ownerInput({ ...ENVIRONMENT, OWNER_NAME: `Abu${String.fromCodePoint(7)}Fadi` })).toStrictEqual({
      problems: ["OWNER_NAME: validation.invalid"],
    });
  });

  it("reads only its own variables", () => {
    expect(ownerInput({ ...ENVIRONMENT, DATABASE_URL_UNPOOLED: "unread" })).toHaveProperty("input");
  });
});
