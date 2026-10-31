import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { tokenBlocks } from "@/styles/token-blocks";
import {
  APPLE_ICON_SIZE,
  FAVICON_SIZES,
  ICON_FILES,
  icoFile,
  icoImages,
  renderIconFiles,
} from "../../../scripts/checks/icons.ts";

// The site's icons (D-047): the ICO writer, and the committed files, which pnpm icons renders from
// src/app/icon.svg and which must follow it and the colour tokens

const SVG = readFileSync(ICON_FILES.svg);

/** A PNG's size, channels and pixels, and whether every pixel is opaque */
async function decoded(png: Buffer) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const { channels } = await sharp(png).stats();
  const opaque = info.channels === 3 || channels[3]?.min === 255;
  return { width: info.width, height: info.height, channels: info.channels, opaque, data };
}

/** A decoded image's size and channels */
const shape = ({ width, height, channels }: { width: number; height: number; channels: number }) => ({
  width,
  height,
  channels,
});

describe("icoFile", () => {
  it("writes an icon header and an entry per image naming its size and where its PNG is", () => {
    const images = [
      { size: 16, png: Buffer.from("sixteen") },
      { size: 32, png: Buffer.from("thirty-two") },
    ];
    const file = icoFile(images);

    expect([file.readUInt16LE(0), file.readUInt16LE(2), file.readUInt16LE(4)]).toEqual([0, 1, 2]);
    // The first PNG follows the 6-byte header and two 16-byte entries
    expect(file.readUInt32LE(6 + 12)).toBe(38);
    expect(file.readUInt32LE(6 + 16 + 12)).toBe(38 + 7);
    expect(file.readUInt16LE(6 + 6)).toBe(32);
    expect(icoImages(file)).toEqual(images);
  });

  it("writes 256 px as 0, as the format has it, and reads it back as 256", () => {
    const file = icoFile([{ size: 256, png: Buffer.from("png") }]);
    expect(file.readUInt8(6)).toBe(0);
    expect(icoImages(file)[0]?.size).toBe(256);
  });

  it("refuses an image that isn't square, as icoFile writes none", () => {
    const file = icoFile([{ size: 16, png: Buffer.from("sixteen") }]);
    file.writeUInt8(32, 6 + 1);
    expect(() => icoImages(file)).toThrow("Image 1 isn't square: 16 by 32 px");
  });

  it("refuses a file that isn't an icon, or whose entry runs past its end", () => {
    expect(() => icoImages(Buffer.from("not an icon"))).toThrow("Not an icon file");
    // A cursor file has the same form, under type 2
    const cursor = icoFile([{ size: 16, png: Buffer.from("sixteen") }]);
    cursor.writeUInt16LE(2, 2);
    expect(() => icoImages(cursor)).toThrow("Not an icon file");
    const cut = icoFile([{ size: 16, png: Buffer.from("sixteen") }]).subarray(0, 25);
    expect(() => icoImages(cut)).toThrow("Image 1 runs past the end of the file");
  });
});

describe("the committed icons", () => {
  it("draw on the public site's colours: the M in --ink on --bg, the line in --scan", () => {
    const { blocks } = tokenBlocks(readFileSync("src/styles/tokens.css", "utf8"));
    const root = blocks.get(":root");
    const fills = Array.from(SVG.toString("utf8").matchAll(/fill="([^"]+)"/g), ([, fill]) => fill);
    expect(fills).toEqual([root?.get("--bg"), root?.get("--ink"), root?.get("--scan")]);
  });

  it("have a 180 px home screen icon without alpha, and a favicon at 16, 32 and 48 px in opaque RGBA", async () => {
    const apple = await decoded(readFileSync(ICON_FILES.apple));
    expect([apple.width, apple.height, apple.channels]).toEqual([APPLE_ICON_SIZE, APPLE_ICON_SIZE, 3]);
    const images = icoImages(readFileSync(ICON_FILES.favicon));
    expect(images.map(({ size }) => size)).toEqual([...FAVICON_SIZES]);
    for (const { size, png } of images) {
      const image = await decoded(png);
      expect([image.width, image.height, image.channels, image.opaque]).toEqual([size, size, 4, true]);
    }
  });

  it("are what pnpm icons renders from the SVG", async () => {
    const rendered = await renderIconFiles(SVG);
    const pngs = (apple: Buffer, favicon: Buffer) => [apple, ...icoImages(favicon).map(({ png }) => png)];
    const [made, kept] = await Promise.all([
      Promise.all(pngs(rendered.apple, rendered.favicon).map(decoded)),
      Promise.all(pngs(readFileSync(ICON_FILES.apple), readFileSync(ICON_FILES.favicon)).map(decoded)),
    ]);
    // The same images in size and channels: the home screen icon without alpha, the favicon's with it
    expect(made.map(shape)).toEqual(kept.map(shape));
    for (const [index, image] of made.entries()) {
      // librsvg may round a pixel differently on another system; a changed SVG moves whole strokes
      const other = kept[index]?.data ?? Buffer.alloc(0);
      const difference = image.data.reduce((sum, value, at) => sum + Math.abs(value - (other[at] ?? 0)), 0);
      expect(difference / image.data.length, `${image.width} px`).toBeLessThan(1);
    }
  });
});
