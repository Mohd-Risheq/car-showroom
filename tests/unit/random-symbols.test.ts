import { afterEach, describe, expect, it, vi } from "vitest";
import { cryptoBytes, drawSymbols } from "@/lib/random-symbols";
import { plantCryptoBytes, scripted } from "../support/random";

// Symbols drawn evenly from an alphabet, by rejection sampling over random bytes

afterEach(() => {
  vi.restoreAllMocks();
});

describe("drawSymbols", () => {
  it("maps each usable byte onto the alphabet by its remainder", () => {
    expect(drawSymbols("abc", 4, scripted(0, 1, 2, 3))).toBe("abca");
    expect(drawSymbols("abc", 2, scripted(254, 253))).toBe("cb");
  });

  it("draws again for a byte at or above the largest multiple of the alphabet's length", () => {
    // 255 is 3 × 85: the byte 255 would make a the likeliest symbol
    expect(drawSymbols("abc", 2, scripted(255, 1, 255, 2))).toBe("bc");
    // 56 symbols divide 224 bytes evenly, so 224 to 255 are drawn again
    const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRST";
    expect(drawSymbols(alphabet, 3, scripted(223, 224, 255, 0, 55))).toBe("T0T");
  });

  it("asks each round for the symbols still missing, and no more", () => {
    // 255 is drawn again, so the second round asks for one byte, and the 2 after it is never read
    expect(drawSymbols("abc", 2, scripted(255, 0, 1, 2))).toBe("ab");
  });

  it("takes every byte for an alphabet whose length divides 256", () => {
    expect(drawSymbols("ab", 3, scripted(255, 254, 129))).toBe("bab");
  });

  it("draws nothing for no symbols", () => {
    expect(drawSymbols("abc", 0, scripted())).toBe("");
  });

  it("stops when the source gives too few usable bytes", () => {
    expect(() => drawSymbols("abc", 4, scripted(0, 1))).toThrow("The random source gave too few usable bytes");
    expect(() => drawSymbols("abc", 1, (count) => new Uint8Array(count).fill(255))).toThrow(Error);
  });

  it("refuses an alphabet a byte can't cover", () => {
    expect(() => drawSymbols("", 4, scripted(0))).toThrow(RangeError);
    expect(() => drawSymbols("a".repeat(257), 4, scripted(0))).toThrow(RangeError);
  });
});

describe("cryptoBytes", () => {
  it("reads the platform's cryptographic source", () => {
    const source = plantCryptoBytes(7, 8, 9);
    expect(cryptoBytes(3)).toStrictEqual(Uint8Array.from([7, 8, 9]));
    expect(source).toHaveBeenCalledOnce();
  });

  it("gives drawSymbols bytes that reach every symbol", () => {
    const drawn = drawSymbols("ab", 64, cryptoBytes);
    expect(drawn).toMatch(/^[ab]{64}$/);
    // Sixty-four draws of one symbol happen once in 2^63 runs
    expect(new Set(drawn).size).toBe(2);
  });
});
