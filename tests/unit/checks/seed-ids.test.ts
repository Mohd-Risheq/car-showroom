import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SEED_NAMESPACE, seedIds, uuidv5 } from "../../../scripts/checks/seed-ids.ts";

// 05-SEED-DATA §5.2: seed rows take UUID version 5 ids, so a re-seed keeps them

const V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// RFC 9562 §6.6's DNS namespace
const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

describe("uuidv5", () => {
  it("gives RFC 9562's example: www.example.com in the DNS namespace", () => {
    expect(uuidv5(DNS_NAMESPACE, "www.example.com")).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });

  it("writes version 5 and the RFC 9562 variant, and passes the schemas that check ids", () => {
    for (const name of ["", "seed:s01", "place:amman", "alias:toyota-camry:كامري"]) {
      const id = uuidv5(SEED_NAMESPACE, name);
      expect(id).toMatch(V5);
      expect(z.uuid().safeParse(id).success).toBe(true);
    }
  });

  it("gives one name the same id every time, and another name another id", () => {
    expect(uuidv5(SEED_NAMESPACE, "seed:s01")).toBe(uuidv5(SEED_NAMESPACE, "seed:s01"));
    expect(uuidv5(SEED_NAMESPACE, "seed:s01")).not.toBe(uuidv5(SEED_NAMESPACE, "seed:s02"));
    expect(uuidv5(SEED_NAMESPACE, "seed:s01")).not.toBe(uuidv5(DNS_NAMESPACE, "seed:s01"));
  });

  it("refuses a namespace that isn't a UUID in lower case", () => {
    expect(() => uuidv5("not-a-uuid", "seed:s01")).toThrow(RangeError);
    expect(() => uuidv5(SEED_NAMESPACE.toUpperCase(), "seed:s01")).toThrow(RangeError);
  });
});

describe("seedIds", () => {
  it("keeps the seed's ids: a changed namespace or name would move every seed row", () => {
    // Worked out by Python's uuid.uuid5, one of each kind, so an edit to the namespace or any name
    // shows here first
    expect({
      car: seedIds.car("s01"),
      inspection: seedIds.inspection("s01"),
      panel: seedIds.panel("s01", "hood"),
      milestone: seedIds.milestone("s01", 0),
      priceChange: seedIds.priceChange("s01", 0),
      place: seedIds.place("amman"),
      alias: seedIds.alias("toyota-camry", "كامري"),
      dealer: seedIds.dealer("muftah"),
      settings: seedIds.settings("muftah"),
    }).toStrictEqual({
      car: "cdbfe34a-bd9b-5e6d-893d-2e2d6f090662",
      inspection: "1ecfe613-7d24-570d-b479-48d33f3e9c6a",
      panel: "2ea91884-2e1d-5f52-882f-6f531b4ed109",
      milestone: "524d7a25-c560-5cbe-ab47-183ddac1c549",
      priceChange: "8d6604a6-d950-5d57-bd51-9591e583f925",
      place: "00b27ea9-dd81-5e5a-8ab2-db97b4043056",
      alias: "a8b0c239-dcf5-5e9e-9943-23db6d2c415d",
      dealer: "dfeab6b5-8013-5310-a7d9-76b0bd7a568b",
      settings: "2e5d0942-8d90-5695-8cf4-0c4929faeacd",
    });
  });

  it("gives each kind of row its own name, so no two rows share an id", () => {
    const ids = [
      seedIds.car("s01"),
      seedIds.inspection("s01"),
      seedIds.panel("s01", "hood"),
      seedIds.panel("s01", "roof"),
      seedIds.milestone("s01", 0),
      seedIds.milestone("s01", 1),
      seedIds.priceChange("s01", 0),
      seedIds.place("amman"),
      seedIds.alias("toyota-camry", "camri"),
      seedIds.dealer("muftah"),
      seedIds.settings("muftah"),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
