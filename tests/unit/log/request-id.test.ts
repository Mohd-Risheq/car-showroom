import { describe, expect, it } from "vitest";
import { requestIdFrom } from "@/lib/log/request-id";

// SRS §13.4: the platform's request ID, or a new one locally

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("requestIdFrom", () => {
  it("uses the platform's x-vercel-id", () => {
    const id = "fra1::iad1::abcde-1760000000000-0123456789ab";
    expect(requestIdFrom(new Headers({ "x-vercel-id": id }))).toBe(id);
  });

  it("makes a new ID when the header is missing or not of the platform's form", () => {
    for (const id of [undefined, "", 'fra1" injected', "a".repeat(129), "fra1/../x"]) {
      const headers = new Headers(id === undefined ? {} : { "x-vercel-id": id });
      expect(requestIdFrom(headers)).toMatch(UUID);
    }
  });
});
