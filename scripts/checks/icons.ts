// The site's icons (owner, 2026-10-30; D-047). src/app/icon.svg is drawn from Readex Pro: the M of
// the display step (wght 600, HEXP 100) in --ink on --bg, crossed at the x-height by a line in
// --scan as DESIGN §2's mark is, on a 32-unit tile where the line and the stems' outer edges and
// ends fall on whole pixels at 16 and 32 px. pnpm icons renders the two raster icons from it: the
// 180 px icon iOS puts on a home screen, opaque because iOS fills transparency with black, and
// favicon.ico at 16, 32 and 48 px for whatever asks for /favicon.ico. Next.js links all three from
// every page's head. Tested in tests/unit/checks/icons.test.ts.
import path from "node:path";
import sharp from "sharp";
import { ROOT } from "./files.ts";

const APP = path.join(ROOT, "src", "app");

export const ICON_FILES = {
  svg: path.join(APP, "icon.svg"),
  apple: path.join(APP, "apple-icon.png"),
  favicon: path.join(APP, "favicon.ico"),
};

export const APPLE_ICON_SIZE = 180;
export const FAVICON_SIZES = [16, 32, 48] as const;

/**
 * The SVG at a size in pixels, as a PNG. The tile is opaque; the home screen icon drops the alpha
 * channel, while an ICO's PNGs keep it, as some readers of ICO files take nothing but RGBA
 * (Turbopack's among them).
 */
export async function renderIcon(svg: Buffer, size: number, { alpha }: { alpha: boolean }): Promise<Buffer> {
  // sharp loads an SVG at the scale resize() asks for, so its strokes are drawn at the icon's size.
  // librsvg's PNG has an alpha channel already: ensureAlpha keeps one should a renderer give none.
  const image = sharp(svg).resize(size, size);
  return (alpha ? image.ensureAlpha() : image.removeAlpha()).png({ compressionLevel: 9 }).toBuffer();
}

/** What pnpm icons writes from the SVG: the home screen icon without alpha, and the favicon in RGBA */
export async function renderIconFiles(svg: Buffer): Promise<{ apple: Buffer; favicon: Buffer }> {
  const [apple, images] = await Promise.all([
    renderIcon(svg, APPLE_ICON_SIZE, { alpha: false }),
    Promise.all(FAVICON_SIZES.map(async (size) => ({ size, png: await renderIcon(svg, size, { alpha: true }) }))),
  ]);
  return { apple, favicon: icoFile(images) };
}

export type IcoImage = { size: number; png: Buffer };

/** An ICO file of PNG images, the form every current browser and Windows reads */
export function icoFile(images: readonly IcoImage[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // an icon, not a cursor
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = header.length + entries.length;
  for (const [index, { size, png }] of images.entries()) {
    const at = index * 16;
    // Width and height take a byte each, where 0 means 256
    entries.writeUInt8(size % 256, at);
    entries.writeUInt8(size % 256, at + 1);
    entries.writeUInt8(0, at + 2); // no palette
    entries.writeUInt8(0, at + 3); // reserved
    entries.writeUInt16LE(1, at + 4); // colour planes
    entries.writeUInt16LE(32, at + 6); // bits per pixel
    entries.writeUInt32LE(png.length, at + 8);
    entries.writeUInt32LE(offset, at + 12);
    offset += png.length;
  }
  return Buffer.concat([header, entries, ...images.map(({ png }) => png)]);
}

/** The images an ICO file holds, read back: the reverse of icoFile, whose images are square */
export function icoImages(file: Buffer): IcoImage[] {
  if (file.length < 6 || file.readUInt16LE(0) !== 0 || file.readUInt16LE(2) !== 1) throw new Error("Not an icon file");
  return Array.from({ length: file.readUInt16LE(4) }, (_, index) => {
    const at = 6 + index * 16;
    const [width, height] = [file.readUInt8(at) || 256, file.readUInt8(at + 1) || 256];
    if (width !== height) throw new Error(`Image ${index + 1} isn't square: ${width} by ${height} px`);
    const length = file.readUInt32LE(at + 8);
    const offset = file.readUInt32LE(at + 12);
    if (offset + length > file.length) throw new Error(`Image ${index + 1} runs past the end of the file`);
    return { size: width, png: file.subarray(offset, offset + length) };
  });
}
