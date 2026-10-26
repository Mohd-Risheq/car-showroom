import { afterEach, describe, expect, it, vi } from "vitest";
import { claimRefCode, drawRefCode, isRefCode, parseRefCode, REF_SYMBOLS } from "@/features/dealer/domain/ref-code";

// BR-15: the dealer's two-letter prefix, a hyphen and four symbols that can't be mistaken for one
// another. BR-33 matches a typed code whatever its case.

/** A random source that hands out the given bytes in order, and nothing once they run out */
function scripted(...bytes: number[]) {
  const queue = [...bytes];
  return (count: number) => Uint8Array.from(queue.splice(0, count));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("drawing a reference code", () => {
  it("uses the 31 symbols of BR-15, with no 0, O, 1, I or L", () => {
    expect(REF_SYMBOLS).toHaveLength(31);
    expect(new Set(REF_SYMBOLS).size).toBe(31);
    expect(REF_SYMBOLS).not.toMatch(/[01OIL]/);
    // The database checks each symbol against car_ref_code_format
    for (const symbol of REF_SYMBOLS) expect(symbol).toMatch(/^[2-9A-HJKMNP-Z]$/);
  });

  it("writes the prefix, a hyphen and a symbol for each byte", () => {
    expect(drawRefCode("MU", scripted(0, 1, 2, 3))).toBe("MU-2345");
    expect(drawRefCode("AB", scripted(30, 31, 61, 247))).toBe("AB-Z2ZZ");
  });

  it("maps the bytes 0 to 247 onto the symbols evenly, eight bytes to each", () => {
    const counts = new Map<string, number>();
    for (let byte = 0; byte < 248; byte += 4) {
      const symbols = drawRefCode("MU", scripted(byte, byte + 1, byte + 2, byte + 3)).slice(3);
      for (const symbol of symbols) counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
    }
    expect([...counts.keys()].sort().join("")).toBe([...REF_SYMBOLS].sort().join(""));
    expect(new Set(counts.values())).toStrictEqual(new Set([8]));
  });

  it("draws again for the bytes 248 to 255, which would favour the first eight symbols", () => {
    expect(drawRefCode("MU", scripted(248, 255, 0, 1, 2, 3))).toBe("MU-2345");
    expect(drawRefCode("MU", scripted(0, 252, 1, 249, 2, 3))).toBe("MU-2345");
  });

  it("stops with an error when the random source gives nothing usable", () => {
    expect(() => drawRefCode("MU", scripted())).toThrow(Error);
    expect(() => drawRefCode("MU", () => new Uint8Array(4).fill(255))).toThrow(Error);
  });

  it("refuses a prefix that isn't two capital letters (dealer.ref_prefix)", () => {
    for (const prefix of ["", "M", "mu", "Mu", "MUX", "M1", "M-"]) {
      expect(() => drawRefCode(prefix, scripted(0, 1, 2, 3)), prefix).toThrow(RangeError);
    }
  });

  it("draws from the platform's cryptographic source unless given another", () => {
    const source = vi.spyOn(globalThis.crypto, "getRandomValues");
    const code = drawRefCode("MU");
    expect(isRefCode(code)).toBe(true);
    expect(code.startsWith("MU-")).toBe(true);
    expect(source).toHaveBeenCalled();
  });
});

describe("claiming a free reference code", () => {
  it("draws again while the claim finds the code taken, and returns what the claim made", async () => {
    const tried: string[] = [];
    const row = await claimRefCode(
      "MU",
      async (code) => {
        tried.push(code);
        return code === "MU-2345" ? undefined : { refCode: code };
      },
      { randomBytes: scripted(0, 1, 2, 3, 4, 5, 6, 7) },
    );
    expect(tried).toStrictEqual(["MU-2345", "MU-6789"]);
    expect(row).toStrictEqual({ refCode: "MU-6789" });
  });

  it("takes a claim that resolves to the row it made, not to nothing, a list or a driver's result", async () => {
    // @ts-expect-error: a claim that resolves to nothing reads as taken on every draw
    await expect(claimRefCode("MU", async () => {})).rejects.toThrow(Error);
    // @ts-expect-error: a list reads as a free code even when it's empty and the code was taken
    expect(await claimRefCode("MU", async () => [])).toStrictEqual([]);
    // @ts-expect-error: an insert's own result, without returning(), reads as free when the code was taken
    expect(await claimRefCode("MU", async () => ({ rowCount: 0 }))).toStrictEqual({ rowCount: 0 });
  });

  it("gives up after eight taken codes", async () => {
    const claim = vi.fn(async () => undefined);
    await expect(claimRefCode("MU", claim, { randomBytes: (count) => new Uint8Array(count) })).rejects.toThrow(Error);
    expect(claim).toHaveBeenCalledTimes(8);
  });
});

describe("reading a reference code", () => {
  it("knows a stored code, in capitals, by the database's pattern", () => {
    expect(isRefCode("MU-3HK8")).toBe(true);
    for (const code of ["mu-3hk8", "MU-3HK0", "MU-3HKL", "MU-3HKO", "MU3HK8", "MU-3HK8 ", "MUX-3HK8", "MU-3HK", ""]) {
      expect(isRefCode(code), code).toBe(false);
    }
  });

  it("BR-33: matches a typed code whatever its case, around spaces and in Arabic digits", () => {
    expect(parseRefCode("mu-3hk8")).toBe("MU-3HK8");
    expect(parseRefCode(" Mu-3Hk8 ")).toBe("MU-3HK8");
    const arabicThree = String.fromCodePoint(0x0663);
    const arabicEight = String.fromCodePoint(0x0668);
    expect(parseRefCode(`MU-${arabicThree}HK${arabicEight}`)).toBe("MU-3HK8");
  });

  it("matches a code pasted with the invisible marks around it, as text that isolates it carries (FR-01.8)", () => {
    const [lri, pdi, rlm] = [0x2066, 0x2069, 0x200f].map((codePoint) => String.fromCodePoint(codePoint));
    expect(parseRefCode(`${lri}MU-3HK8${pdi}`)).toBe("MU-3HK8");
    expect(parseRefCode(`${rlm}mu-3hk8${rlm} `)).toBe("MU-3HK8");
  });

  it("finds no code in text that isn't one", () => {
    for (const typed of ["", "MU-3HKO", "mu 3hk8", "MU-3HK8X", "3HK8"]) expect(parseRefCode(typed), typed).toBeNull();
  });
});
