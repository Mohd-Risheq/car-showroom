import { describe, expect, it } from "vitest";
import { checkVin, isNorthAmerican, normalizeVin, vinCheckDigit } from "@/lib/validation/vin";

// VR-04 and BR-23, TC-36-1: the VIN's form, and its check digit in and outside North America

// Every VIN in 05-SEED-DATA §6: seed cars (§6.2), bench cars (§6.3) and the demo rotation (§6.4).
// vPIC reported each one's check digit as correct.
const SEED_VINS = [
  "4T1B31HK3KU190069",
  "7SAYGDEE5NF207554",
  "KMHE24L16HA998152",
  "JTDKARFU8H3503077",
  "3FA6P0LU7HR693560",
  "3FA6P0SU6JR470627",
  "5YJ3E1EA2MF350811",
  "5YJ3E1EBXLF251130",
  "1C4RJFAG3HC658702",
  "1FA6P8TH7H5480595",
  "1HGCV3F18JA518032",
  "2T3RWRFV1LW191862",
  "JTHBW1GG6H2277380",
  "55SWF4KB4JU205644",
  "1G1RC6S53HU929929",
  "5NPD84LF3KH309825",
  "4T1B21HK2JU124906",
  "KMHE34L11GA335003",
  "KNAGU4LE2H5513294",
  "1G1FY6S05L4526925",
  "1FM5K8D85GG997554",
  "2C3CDXBGXJH536685",
  "4T1B11HK2JU128781",
  "1N4AL3AP3GC678636",
  "2T1BURHE2HC113595",
  "2HGFC2F53KH972076",
  "1G1ZE5ST7GF486593",
  "5N1AT2MV1JC083446",
];

describe("VIN check digit", () => {
  it("matches position 9 of every seed VIN", () => {
    for (const vin of SEED_VINS) expect(vinCheckDigit(vin), vin).toBe(vin.charAt(8));
  });

  it("writes a remainder of 10 as X", () => {
    expect(vinCheckDigit("5YJ3E1EBXLF251130")).toBe("X");
    expect(vinCheckDigit("2C3CDXBGXJH536685")).toBe("X");
  });
});

describe("VIN validation", () => {
  it("accepts every seed VIN with no warning", () => {
    for (const vin of SEED_VINS) expect(checkVin(vin), vin).toEqual({ ok: true, warning: null });
  });

  it("treats a World Manufacturer Identifier starting 1 to 5 as North American (BR-23)", () => {
    expect(
      ["1C4RJFAG3HC658702", "2T3RWRFV1LW191862", "3FA6P0LU7HR693560", "4T1B31HK3KU190069", "5YJ3E1EBXLF251130"].every(
        isNorthAmerican,
      ),
    ).toBe(true);
    expect(
      ["KMHE24L16HA998152", "JTDKARFU8H3503077", "7SAYGDEE5NF207554", "WVWZZZ1KZAW000001"].some(isNorthAmerican),
    ).toBe(false);
  });

  it("rejects a North American VIN whose check digit does not match", () => {
    // FR-36's acceptance criterion uses this one as its format example: position 9 holds 5, the digit is 8
    expect(vinCheckDigit("4T1B11HK5KU000000")).toBe("8");
    expect(checkVin("4T1B11HK5KU000000")).toEqual({ ok: false, error: "validation.vinCheckDigit" });
    expect(checkVin("4T1B31HK4KU190069")).toEqual({ ok: false, error: "validation.vinCheckDigit" });
  });

  it("only warns about a check digit mismatch outside North America, where it may not be used", () => {
    expect(checkVin("WVWZZZ1KZAW000001")).toEqual({ ok: true, warning: "validation.vinCheckDigitWarn" });
    expect(checkVin("JTDKARFU1H3503077")).toEqual({ ok: true, warning: "validation.vinCheckDigitWarn" });
    // BR-23 names 1 to 5, so a 7 is outside North America for this rule, though S04 was built in Fremont
    expect(checkVin("7SAYGDEE4NF207554")).toEqual({ ok: true, warning: "validation.vinCheckDigitWarn" });
  });

  it("rejects I, O and Q, and any length but 17 (FR-36.1)", () => {
    for (const vin of [
      "4T1B31HK3KU19OO69",
      "4T1B31HK3KU1900I9",
      "QT1B31HK3KU190069",
      "4T1B31HK3KU19006",
      "4T1B31HK3KU1900690",
      "",
      "4T1B31HK3KU 90069",
      "4T1B31HK3KU-90069",
    ]) {
      expect(checkVin(vin), vin).toEqual({ ok: false, error: "validation.vin" });
    }
  });

  it("checks normalized text: trimmed and in capitals", () => {
    expect(checkVin("4t1b31hk3ku190069")).toEqual({ ok: false, error: "validation.vin" });
    expect(normalizeVin("  4t1b31hk3ku190069\n")).toBe("4T1B31HK3KU190069");
    expect(checkVin(normalizeVin("  4t1b31hk3ku190069\n"))).toEqual({ ok: true, warning: null });
  });
});
