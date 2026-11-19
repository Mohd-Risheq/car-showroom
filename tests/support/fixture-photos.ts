import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import type { PhotoGroup } from "../../src/lib/db/enums.ts";
import { e2eStore } from "./e2e-store.ts";

// The photos of the car page's e2e copies (FR-10): fields of their group's colour, each with its
// number, at the seed photos' widths (480, 960 and 1200). Each is written once to the run's local
// store, which every copy that shows it shares, and the global teardown removes. A photo's address
// is a path on the site, as the seed's are, so the page shows it on whichever origin a test reaches
// it by: the WebKit projects come through the HTTPS proxy. A test can watch which files a page asks
// for. TC-10-1's 18 photos are here for the gallery's and the viewer's journeys and baselines.

/** A copy's photo, and what a test needs of it */
export type FixturePhoto = {
  readonly group: PhotoGroup;
  /** The dealer's alt text, in the languages they wrote it in */
  readonly alt?: Partial<Record<"ar" | "en", string>>;
  /** Portrait, 3:4, where the others are 4:3 */
  readonly portrait?: boolean;
  /** Files the store hasn't got, as a photo whose link broke */
  readonly broken?: boolean;
  /** The note of the inspection panel the photo is the close-up of, in the languages written */
  readonly note?: Partial<Record<"ar" | "en", string>>;
};

/** A photo's files and what its media row says of them */
type StoredPhoto = {
  readonly variants: Record<"480" | "960" | "1200", string>;
  readonly width: number;
  readonly height: number;
  readonly color: string;
  readonly bytes: number;
};

/** Photos of the group, as many as given */
export const inGroup = (count: number, group: PhotoGroup): FixturePhoto[] =>
  Array.from({ length: count }, () => ({ group }));

/** TC-10-1's car: 18 photos in the dealer's order, 3 of them imperfections: the 9th, 16th and 17th */
export const EIGHTEEN: readonly FixturePhoto[] = [
  ...inGroup(8, "exterior"),
  { group: "imperfection" },
  ...inGroup(4, "interior"),
  ...inGroup(2, "engine"),
  ...inGroup(2, "imperfection"),
  { group: "exterior" },
];

const WIDTHS = ["480", "960", "1200"] as const;

/** The stored photos' folder, and the path the site serves it at */
const FOLDER = "fixtures/photos";
const SERVED_AT = `/api/storage-local/files/${FOLDER}`;

/** Each group's colour, dark enough for the number's white */
const COLORS: Record<PhotoGroup, string> = {
  exterior: "#2f4858",
  interior: "#5a4632",
  engine: "#3d3d46",
  imperfection: "#6b2f2f",
};

/** The files this worker has written, by name, with their sizes */
const written = new Map<string, number>();

/** The photo at the place given (from 1), its files written to the store unless it is broken */
export async function storedPhoto(photo: FixturePhoto, place: number): Promise<StoredPhoto> {
  const shape = photo.portrait ? "portrait" : "landscape";
  const name = photo.broken ? `missing-${crypto.randomUUID()}` : `${photo.group}-${place}-${shape}`;
  const color = COLORS[photo.group];
  const sizes = await Promise.all(
    WIDTHS.map((width) => (photo.broken ? 1 : stored(`${name}-${width}.webp`, Number(width), photo, place, color))),
  );
  const largest = Number(WIDTHS.at(-1));
  return {
    variants: {
      "480": `${SERVED_AT}/${name}-480.webp`,
      "960": `${SERVED_AT}/${name}-960.webp`,
      "1200": `${SERVED_AT}/${name}-1200.webp`,
    },
    width: largest,
    height: heightOf(largest, photo),
    color,
    bytes: sizes.reduce((sum, size) => sum + size, 0),
  };
}

/** The path the site serves the stored photos at */
export const PHOTO_FILES = `${SERVED_AT}/`;

/** Watches the photo files the page asks for, and gives their names */
export function watchPhotoFiles(page: Page): () => string[] {
  const files: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith(PHOTO_FILES)) files.push(pathname.slice(PHOTO_FILES.length));
  });
  return () => files;
}

const heightOf = (width: number, photo: FixturePhoto) => (photo.portrait ? (width * 4) / 3 : (width * 3) / 4);

/**
 * The file's size, once it is in the store: written beside it, then moved in whole, as the workers
 * share the store
 */
async function stored(file: string, width: number, photo: FixturePhoto, place: number, color: string): Promise<number> {
  const known = written.get(file);
  if (known !== undefined) return known;
  const height = heightOf(width, photo);
  const number = `<svg width="${width}" height="${height}"><text x="50%" y="50%" fill="#ffffff" font-family="sans-serif" font-size="${height / 3}" text-anchor="middle" dominant-baseline="central">${place}</text></svg>`;
  const image = await sharp({ create: { width, height, channels: 3, background: color } })
    .composite([{ input: Buffer.from(number) }])
    .webp({ quality: 82 })
    .toBuffer();
  const target = path.join(e2eStore(), FOLDER, file);
  await mkdir(path.dirname(target), { recursive: true });
  const draft = `${target}.${process.pid}.draft`;
  await writeFile(draft, image);
  await rename(draft, target);
  written.set(file, image.length);
  return image.length;
}
