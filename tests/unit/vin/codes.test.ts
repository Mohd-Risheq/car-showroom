import { describe, expect, it } from "vitest";
import { TEST_CODES } from "@/app/[locale]/dealer/(dev)/dev/vin/codes";
import { VIN_FORMATS, vinFromBarcode } from "@/features/vin/barcode";

// The scan fixtures say what the scanner should fill, so a browser run can check each read against them

describe("VIN test codes", () => {
  it("expect what vinFromBarcode keeps of their text", () => {
    for (const code of TEST_CODES) expect(vinFromBarcode(code.text)?.vin ?? null, code.id).toBe(code.vin);
  });

  it("cover every format the scanner reads, and a code it must skip", () => {
    expect(new Set(TEST_CODES.map((code) => code.format))).toEqual(new Set(VIN_FORMATS));
    expect(TEST_CODES.some((code) => code.vin === null)).toBe(true);
  });
});
