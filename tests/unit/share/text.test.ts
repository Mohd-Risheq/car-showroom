import { describe, expect, it } from "vitest";
import { wrapLines } from "@/features/share/renderer/text";

// The renderer's line breaking (SRS §11.6, DESIGN §9.4). Shaping is the browser's job and is
// checked in the browsers (spike T-04); here every character is 10 px wide.

const ctx = { measureText: (text: string) => ({ width: [...text].length * 10 }) as TextMetrics };
const NBSP = " ";

describe("wrapLines", () => {
  it("breaks at spaces and keeps words whole", () => {
    expect(wrapLines(ctx, "aaa bbb ccc", 70, "en")).toEqual(["aaa bbb", "ccc"]);
    expect(wrapLines(ctx, "فحص كامل للهيكل (شاصي) والمحرك", 160, "ar")).toEqual(["فحص كامل للهيكل", "(شاصي) والمحرك"]);
  });

  it("keeps a number with its unit across a no-break space", () => {
    const lines = wrapLines(ctx, `price 84,000${NBSP}km today`, 130, "en");
    expect(lines).toEqual(["price", `84,000${NBSP}km`, "today"]);
    expect(wrapLines(ctx, `السعر 14,500${NBSP}د.أ اليوم`, 100, "ar")).toEqual(["السعر", `14,500${NBSP}د.أ`, "اليوم"]);
  });

  it("keeps punctuation with its word", () => {
    expect(wrapLines(ctx, "والجير، 12 قطعة؟", 80, "ar")).toEqual(["والجير،", "12 قطعة؟"]);
  });

  it("starts a new line at a line feed", () => {
    expect(wrapLines(ctx, "one\ntwo three", 200, "en")).toEqual(["one", "two three"]);
  });

  it("ends the last allowed line with an ellipsis that fits", () => {
    const lines = wrapLines(ctx, "aaa bbb ccc ddd eee", 70, "en", 2);
    expect(lines).toEqual(["aaa bbb", "ccc…"]);
    const arabic = wrapLines(ctx, "تويوتا هايبرد فل كامل مع فتحة سقف", 120, "ar", 2);
    expect(arabic).toHaveLength(2);
    expect(arabic[1]?.endsWith("…")).toBe(true);
    for (const line of arabic) expect(ctx.measureText(line).width).toBeLessThanOrEqual(120);
  });

  it("breaks a word wider than the line, and trims it before an ellipsis", () => {
    const vin = "JTMBFREV5MD123456";
    const lines = wrapLines(ctx, `VIN ${vin}`, 100, "en");
    expect(lines.join("").replace(/^VIN/, "")).toBe(vin);
    for (const line of lines) expect(ctx.measureText(line).width).toBeLessThanOrEqual(100);
    expect(wrapLines(ctx, vin, 60, "en", 1)).toEqual(["JTMBF…"]);
  });

  it("never passes the width, for any text", () => {
    const words = ["سيارة", "RAV4", `84,000${NBSP}كم`, "(شاصي)", "a", "JTMBFREV5MD123456", "؟", "Amman."];
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
    for (let round = 0; round < 300; round++) {
      const text = Array.from({ length: 1 + (next() % 12) }, () => words[next() % words.length]).join(" ");
      const width = 60 + (next() % 200);
      for (const line of wrapLines(ctx, text, width, "ar", 1 + (next() % 4))) {
        expect(ctx.measureText(line).width).toBeLessThanOrEqual(width);
      }
    }
  });
});
