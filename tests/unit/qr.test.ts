import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { encodeQr, type QrCode } from "@/lib/qr";

// TC-25-7: the QR encoder's codes, drawn as the pages draw them, read back exactly by a decoder, with
// error correction M or higher (FR-42.2)

/** Pixels to a module where the test draws a code */
const MODULE_PX = 8;

/** The desktop contact sheet's WhatsApp link, its Arabic message percent-encoded as wa.me takes it */
const WHATSAPP_LINK = `https://wa.me/962790000000?text=${encodeURIComponent("مرحبا، أسأل عن تويوتا كامري 2021، الرمز MU-2222")}`;
/** Two-step sign-in's URI, with a key of zero bytes */
const TWO_STEP_URI = `otpauth://totp/Muftah%20Motors:owner%40muftah.test?secret=${"A".repeat(32)}&issuer=Muftah%20Motors`;

beforeAll(async () => {
  // The reader the scanner serves itself (FR-36.2), from its file: a fetch would fail the test
  vi.stubGlobal("fetch", () => Promise.reject(new Error("the decoder fetched something")));
  const wasm = await readFile("public/wasm/zxing_reader.wasm");
  await prepareZXingModule({ overrides: { wasmBinary: new Uint8Array(wasm).buffer }, fireImmediately: true });
});

/** Draws a code as the pages do, its path on white in an SVG, and reads it back */
async function readBack({ size, path }: QrCode) {
  const side = size * MODULE_PX;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${side}" height="${side}">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return readBarcodes(new Uint8Array(png), { formats: ["QRCode"] });
}

describe("encodeQr", () => {
  it("draws the desktop WhatsApp link, Arabic message and all, so it reads back exactly", async () => {
    const [read, ...others] = await readBack(encodeQr(WHATSAPP_LINK));
    expect(others).toStrictEqual([]);
    expect(read?.text).toBe(WHATSAPP_LINK);
  });

  it("draws two-step sign-in's otpauth URI so it reads back exactly", async () => {
    const [read] = await readBack(encodeQr(TWO_STEP_URI));
    expect(read?.text).toBe(TWO_STEP_URI);
  });

  it("encodes text as UTF-8, so Arabic written as itself reads back too", async () => {
    const text = "مفتاح موتورز، عمّان";
    const [read] = await readBack(encodeQr(text));
    expect(read?.text).toBe(text);
  });

  it("corrects errors at M or higher, and at least at the level asked for", async () => {
    const [atM] = await readBack(encodeQr(WHATSAPP_LINK));
    expect(["M", "Q", "H"]).toContain(atM?.ecLevel);
    const [atH] = await readBack(encodeQr(WHATSAPP_LINK, { ecc: "H" }));
    expect(atH?.ecLevel).toBe("H");
  });

  it("leaves a quiet zone of 4 modules on every side", () => {
    const { size, path } = encodeQr(TWO_STEP_URI);
    const runs = [...path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)].map(([, x, y, length]) => ({
      x: Number(x),
      y: Number(y),
      length: Number(length),
    }));
    expect(runs.map(({ x, y, length }) => `M${x} ${y}h${length}v1h-${length}z`).join("")).toBe(path);
    for (const { x, y, length } of runs) {
      expect(Math.min(x, y)).toBeGreaterThanOrEqual(4);
      expect(Math.max(x + length, y + 1)).toBeLessThanOrEqual(size - 4);
    }
  });

  it("is a version 1 code of 21 modules, and 29 with its quiet zone, for a short text", () => {
    expect(encodeQr("MU-2222").size).toBe(29);
  });

  it("raises the correction where the code's size allows: a short text's version 1 code reads at H", async () => {
    const code = encodeQr("MU-2222");
    expect(code.size).toBe(29);
    const [read] = await readBack(code);
    expect(read?.ecLevel).toBe("H");
  });
});
