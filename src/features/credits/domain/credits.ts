import { type CarTitleParts, carTitle } from "@/lib/format/car-title";
import { formatDate } from "@/lib/format/dates";
import type { AppLocale } from "@/lib/i18n/locales";
import {
  type DATA_AND_FONT_LICENCES,
  issueProblems,
  type PHOTO_CHANGES,
  type PHOTO_SITES,
  parseStrict,
  type SeedCreditFile,
  type SeedCredits,
  type SeedLicence,
  type SOUND_CHANGES,
  type SOUND_SITES,
  type StrictParse,
  seedCreditsSchema,
  seedKeySchema,
  seedReferenceSchema,
} from "@/lib/validation/seed";
import { z } from "@/lib/validation/zod";
import {
  licenceLink,
  type SoftwareLicence,
  type SoftwareRow,
  softwareListSchema,
  softwareProblems,
  sourceLink,
} from "./software";

// SCR-14's Credits page (DESIGN §7.2.9): its tables, from the files the app is built with.
// public/seed/credits.json gives the seed's photos and clips and the data and fonts the app uses
// (05-SEED-DATA §3.7), seed/cars.json and seed/reference.json each car's title, and software.json
// with the pins package.json gives (creditedPins) the software (D-048). The files store codes, and a
// cell holds the catalog key of its code, so the page renders it in each language.

type PhotoSite = (typeof PHOTO_SITES)[number];
type SoundSite = (typeof SOUND_SITES)[number];
type DataAndFontLicence = (typeof DATA_AND_FONT_LICENCES)[number];
type FileChange = (typeof PHOTO_CHANGES)[number] | (typeof SOUND_CHANGES)[number];

/** Each site's name, by the manifest's source code */
export const SITE_KEYS = {
  commons: "credits.site.commons",
  unsplash: "credits.site.unsplash",
  pexels: "credits.site.pexels",
  ai: "credits.site.ai",
  owner: "credits.site.owner",
  freesound: "credits.site.freesound",
} as const satisfies Record<PhotoSite | SoundSite, `credits.site.${string}`>;

/** Each licence's name, by its code in the manifest or in software.json. Pexels' CC0 is CC0 (DESIGN §9.2). */
export const LICENCE_KEYS = {
  "cc0-1.0": "credits.licence.cc0",
  "cc-by-2.0": "credits.licence.ccBy20",
  "cc-by-2.5": "credits.licence.ccBy25",
  "cc-by-3.0": "credits.licence.ccBy30",
  "cc-by-4.0": "credits.licence.ccBy40",
  "cc-by-sa-2.0": "credits.licence.ccBySa20",
  "cc-by-sa-2.5": "credits.licence.ccBySa25",
  "cc-by-sa-3.0": "credits.licence.ccBySa30",
  "cc-by-sa-4.0": "credits.licence.ccBySa40",
  unsplash: "credits.licence.unsplash",
  "pexels-cc0": "credits.licence.cc0",
  ai: "credits.licence.ai",
  owner: "credits.licence.owner",
  "public-domain": "credits.licence.publicDomain",
  "odbl-1.0": "credits.licence.odbl",
  "ofl-1.1": "credits.licence.ofl",
  isc: "credits.licence.isc",
  mit: "credits.licence.mit",
  "apache-2.0": "credits.licence.apache",
  "mpl-2.0": "credits.licence.mpl",
  "gsap-standard": "credits.licence.gsap",
} as const satisfies Record<SeedLicence | DataAndFontLicence | SoftwareLicence, `credits.licence.${string}`>;

/** What was done to a file, by the manifest's change code */
export const CHANGE_KEYS = {
  resized: "credits.change.resized",
  "plates pixelated": "credits.change.platesPixelated",
  "exposure normalized": "credits.change.exposureNormalized",
  trimmed: "credits.change.trimmed",
  "mixed to mono": "credits.change.mixedToMono",
  resampled: "credits.change.resampled",
  normalized: "credits.change.normalized",
} as const satisfies Record<FileChange, `credits.change.${string}`>;

export type SiteKey = (typeof SITE_KEYS)[keyof typeof SITE_KEYS];
export type LicenceKey = (typeof LICENCE_KEYS)[keyof typeof LICENCE_KEYS];
export type ChangeKey = (typeof CHANGE_KEYS)[keyof typeof CHANGE_KEYS];

/** A cell's text, a name or a title, and where it links to, if anywhere */
export type Linked = { readonly text: string; readonly href: string | null };

/** An address shown as its host and path, which has no spaces to wrap at, linked to itself */
export type Address = { readonly address: string; readonly href: string };

/** A licence's name, linked to its text where it has one: the owner's own files' has none */
export type LicenceCell = { readonly key: LicenceKey; readonly href: string | null };

export type FileRow = {
  /** The car title */
  readonly car: string;
  readonly site: SiteKey;
  readonly author: Linked;
  readonly licence: LicenceCell;
  /** The file's title at its source, or the original's address, linked to the original */
  readonly original: Linked | Address | null;
  readonly changes: readonly ChangeKey[];
};

/** A clip's recording date, or that it is another car's of the same engine type (§3.5) */
export type Recording = { readonly text: string } | { readonly key: "sound.sameEngine" } | null;

export type SoundRow = FileRow & { readonly recording: Recording };

/** A data source or a font */
export type WorkRow = {
  readonly name: string;
  readonly author: string;
  readonly licence: LicenceCell;
  readonly link: Address;
};

export type SoftwareEntry = {
  readonly name: string;
  /** A dependency's pin, or a bundled package's version: none for a work bundled whole, as zxing-cpp is */
  readonly version: string | null;
  /** The package or work that bundles it */
  readonly within: string | null;
  readonly licence: LicenceCell;
  readonly source: Address;
};

/** The page's tables, in its order */
export type CreditsData = {
  readonly photos: readonly FileRow[];
  readonly sounds: readonly SoundRow[];
  readonly data: readonly WorkRow[];
  readonly fonts: readonly WorkRow[];
  readonly software: readonly SoftwareEntry[];
};

/** The files the page is built from, as the app imports them */
export type CreditsFiles = {
  /** public/seed/credits.json */
  readonly credits: unknown;
  /** seed/cars.json and seed/reference.json, which name each car */
  readonly cars: unknown;
  readonly reference: unknown;
  /** src/features/credits/software.json */
  readonly software: unknown;
  /** The packages the table lists at their pins, as creditedPins reads them from package.json */
  readonly dependencies: unknown;
};

/** The files, read: the manifest, the title of each car it names in each language, and the software */
export type Credits = {
  readonly manifest: SeedCredits;
  readonly titles: ReadonlyMap<string, Readonly<Record<AppLocale, CarTitleParts>>>;
  readonly software: readonly SoftwareRow[];
  readonly dependencies: Readonly<Record<string, string>>;
};

// The fields of seed/cars.json a title needs, the others dropped: check:seed holds the file to its
// whole schema (05-SEED-DATA §10)
const titledCarsSchema = z.array(
  z.object({
    seedKey: seedKeySchema,
    car: z.object({
      modelYear: z.number().int(),
      makeKey: z.string(),
      modelKey: z.string(),
      trim: z.string().nullable(),
    }),
  }),
);

function parseTitledCars(value: unknown): StrictParse<z.output<typeof titledCarsSchema>> {
  const result = titledCarsSchema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, problems: issueProblems(result.error.issues) };
}

/** A file's problems, each after the file's name */
const problemsOf = (file: string, parsed: StrictParse<unknown>) =>
  parsed.ok ? [] : parsed.problems.map((problem) => `${file}: ${problem}`);

/**
 * The files read, or every problem with them: a file that breaks its schema, a photo or clip of a car
 * the seed hasn't got, or software rows that disagree with package.json. The page's data module
 * stops the build on any, so the page can't credit less than the site holds (D-048).
 */
export function readCredits(files: CreditsFiles): { ok: true; credits: Credits } | { ok: false; problems: string[] } {
  const manifest = parseStrict(seedCreditsSchema, files.credits);
  const cars = parseTitledCars(files.cars);
  const reference = parseStrict(seedReferenceSchema, files.reference);
  const software = parseStrict(softwareListSchema, files.software);
  const dependencies = parseStrict(z.record(z.string(), z.string()), files.dependencies);
  if (!manifest.ok || !cars.ok || !reference.ok || !software.ok || !dependencies.ok) {
    return {
      ok: false,
      problems: [
        ...problemsOf("public/seed/credits.json", manifest),
        ...problemsOf("seed/cars.json", cars),
        ...problemsOf("seed/reference.json", reference),
        ...problemsOf("src/features/credits/software.json", software),
        ...problemsOf("package.json's dependencies", dependencies),
      ],
    };
  }

  const problems = softwareProblems(software.data.rows, dependencies.data);
  const titles = new Map<string, Record<AppLocale, CarTitleParts>>();
  for (const key of new Set(manifest.data.files.map((file) => file.car))) {
    const car = cars.data.find((candidate) => candidate.seedKey === key)?.car;
    if (car === undefined) {
      problems.push(`public/seed/credits.json credits files of ${key}, which seed/cars.json has no car for`);
      continue;
    }
    const { modelYear, makeKey, modelKey, trim } = car;
    const make = reference.data.makes.find((candidate) => candidate.key === makeKey);
    const model = reference.data.models.find(
      (candidate) => candidate.makeKey === makeKey && candidate.key === modelKey,
    );
    if (make === undefined || model === undefined) {
      problems.push(`seed/cars.json: ${key}'s make or model isn't in seed/reference.json`);
      continue;
    }
    titles.set(key, {
      ar: { modelYear, make: make.nameAr, model: model.nameAr, trim },
      en: { modelYear, make: make.nameEn, model: model.nameEn, trim },
    });
  }
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    credits: { manifest: manifest.data, titles, software: software.data.rows, dependencies: dependencies.data },
  };
}

/** An address as a cell shows it: its host and path, without the scheme or a closing slash */
export function shownAddress(href: string): string {
  const { host, pathname } = new URL(href);
  let path = pathname;
  try {
    path = decodeURI(pathname);
  } catch {
    // A path whose escapes aren't UTF-8 shows as written
  }
  return `${host}${path.replace(/\/$/, "")}`;
}

/** The original's cell: the file's title at its source, or else its address, linked to the original */
function originalOf({ title, originalUrl }: SeedCreditFile): Linked | Address | null {
  if (title !== null) return { text: title, href: originalUrl };
  return originalUrl === null ? null : { address: shownAddress(originalUrl), href: originalUrl };
}

function fileRow(file: SeedCreditFile, car: string): FileRow {
  return {
    car,
    site: SITE_KEYS[file.source],
    author: { text: file.author, href: file.authorUrl },
    licence: { key: LICENCE_KEYS[file.licence], href: file.licenceUrl },
    original: originalOf(file),
    changes: file.changes.map((change: FileChange) => CHANGE_KEYS[change]),
  };
}

const workRow = ({ name, author, url, licence, licenceUrl }: SeedCredits["data"][number]): WorkRow => ({
  name,
  author,
  licence: { key: LICENCE_KEYS[licence], href: licenceUrl },
  link: { address: shownAddress(url), href: url },
});

function softwareEntry(row: SoftwareRow, dependencies: Readonly<Record<string, string>>): SoftwareEntry {
  // A bundled work's row carries its version, and a dependency's is its pin in package.json
  const version =
    row.within === undefined && Object.hasOwn(dependencies, row.name) ? dependencies[row.name] : row.version;
  const source = sourceLink(row, version);
  return {
    name: row.name,
    version: version ?? null,
    within: row.within ?? null,
    licence: { key: LICENCE_KEYS[row.licence], href: licenceLink(row, version) },
    source: { address: shownAddress(source), href: source },
  };
}

/** The page's tables in a language, from the files readCredits read */
export function creditsTables({ manifest, titles, software, dependencies }: Credits, locale: AppLocale): CreditsData {
  const titleOf = (key: string) => {
    const parts = titles.get(key);
    if (parts === undefined) throw new RangeError(`No title for ${key}: read the files with readCredits`);
    return carTitle(parts[locale]);
  };
  const photos: FileRow[] = [];
  const sounds: SoundRow[] = [];
  for (const file of manifest.files) {
    const row = fileRow(file, titleOf(file.car));
    if (file.kind === "photo") {
      photos.push(row);
    } else if (file.audioSource === "same_engine") {
      sounds.push({ ...row, recording: { key: "sound.sameEngine" } });
    } else {
      sounds.push({
        ...row,
        recording: file.recordedAt === null ? null : { text: formatDate(file.recordedAt, locale) },
      });
    }
  }
  return {
    photos,
    sounds,
    data: manifest.data.map(workRow),
    fonts: manifest.fonts.map(workRow),
    software: software.map((row) => softwareEntry(row, dependencies)),
  };
}
