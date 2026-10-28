import { afterEach, describe, expect, it, vi } from "vitest";
import { drawTemporaryPassword, TEMPORARY_SYMBOLS } from "@/lib/auth/temporary-password";
import { plantCryptoBytes, scripted } from "../../support/random";

// BR-40: 16 random characters from a 56-character set with none that reads as another

// The bytes 0 to 15, which map onto the first 16 symbols
const FIRST_SIXTEEN = Array.from({ length: 16 }, (_, index) => index);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("drawTemporaryPassword", () => {
  it("draws from 56 symbols, leaving out 0, O, o, 1, I and l", () => {
    expect(TEMPORARY_SYMBOLS).toHaveLength(56);
    expect(new Set(TEMPORARY_SYMBOLS).size).toBe(56);
    expect(TEMPORARY_SYMBOLS).toMatch(/^[2-9A-HJ-NP-Za-km-np-z]+$/);
  });

  it("draws 16 of them, each byte below 224 mapping onto one", () => {
    expect(drawTemporaryPassword(scripted(...FIRST_SIXTEEN))).toBe("23456789ABCDEFGH");
    // 224 is 4 × 56: the bytes from 224 up are drawn again
    expect(drawTemporaryPassword(scripted(224, 255, ...FIRST_SIXTEEN.map((byte) => byte + 168)))).toBe(
      "23456789ABCDEFGH",
    );
  });

  it("draws from the platform's cryptographic source unless given another", () => {
    const source = plantCryptoBytes(...FIRST_SIXTEEN);
    expect(drawTemporaryPassword()).toBe("23456789ABCDEFGH");
    expect(source).toHaveBeenCalled();
  });

  it("draws a new one each time", () => {
    const first = drawTemporaryPassword();
    expect(first).toMatch(/^[2-9A-HJ-NP-Za-km-np-z]{16}$/);
    // Two equal draws happen once in 56^16
    expect(drawTemporaryPassword()).not.toBe(first);
  });
});
