import { describe, expect, it } from "vitest";
import { scanRegion, vinFromBarcode } from "@/features/vin/domain/barcode";

// What the scanner keeps of a barcode's text (FR-36.2, TC-36-5), and the part of a frame it reads

describe("VIN from a barcode", () => {
  it("keeps a 17-character VIN that passes VR-04", () => {
    expect(vinFromBarcode("4T1B31HK3KU190069")).toEqual({ vin: "4T1B31HK3KU190069", warning: null });
    expect(vinFromBarcode("5YJ3E1EBXLF251130")).toEqual({ vin: "5YJ3E1EBXLF251130", warning: null });
  });

  it("strips a leading I import marker", () => {
    expect(vinFromBarcode("I4T1B31HK3KU190069")).toEqual({ vin: "4T1B31HK3KU190069", warning: null });
    expect(vinFromBarcode("iKMHE24L16HA998152")).toEqual({ vin: "KMHE24L16HA998152", warning: null });
  });

  it("trims the text and reads it in capitals", () => {
    expect(vinFromBarcode(" 4t1b31hk3ku190069\r\n")).toEqual({ vin: "4T1B31HK3KU190069", warning: null });
  });

  it("keeps a VIN from outside North America with its check digit warning", () => {
    expect(vinFromBarcode("WVWZZZ1KZAW000001")).toEqual({
      vin: "WVWZZZ1KZAW000001",
      warning: "validation.vinCheckDigitWarn",
    });
    expect(vinFromBarcode("IWVWZZZ1KZAW000001")).toEqual({
      vin: "WVWZZZ1KZAW000001",
      warning: "validation.vinCheckDigitWarn",
    });
  });

  it("drops a North American VIN whose check digit fails, so a misread never fills the field", () => {
    expect(vinFromBarcode("4T1B11HK5KU000000")).toBeNull();
    expect(vinFromBarcode("I4T1B11HK5KU000000")).toBeNull();
    expect(vinFromBarcode("4T1B31HK4KU190069")).toBeNull();
  });

  it("drops anything else: other lengths, other prefixes, and VINs inside longer text", () => {
    for (const text of [
      "",
      "4T1B31HK3KU19006",
      "X4T1B31HK3KU190069",
      "II4T1B31HK3KU190069",
      "I4T1B31HK3KU19006",
      "VIN 4T1B31HK3KU190069",
      "https://example.com/4T1B31HK3KU190069",
      "MUFTAH T-10",
    ]) {
      expect(vinFromBarcode(text), text).toBeNull();
    }
  });
});

describe("scan region", () => {
  it("is a centred band twice as wide as it is tall, across 90 % of the frame", () => {
    expect(scanRegion(1920, 1080)).toEqual({ x: 96, y: 108, width: 1728, height: 864 });
    expect(scanRegion(1080, 1920)).toEqual({ x: 54, y: 717, width: 972, height: 486 });
    expect(scanRegion(640, 480)).toEqual({ x: 32, y: 96, width: 576, height: 288 });
  });

  it("never runs past a short frame", () => {
    expect(scanRegion(1920, 600)).toEqual({ x: 96, y: 0, width: 1728, height: 600 });
  });
});
