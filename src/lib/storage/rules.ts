// Media kinds, variants, size caps, content types and pathnames, shared by the browser upload
// and the server checks (API-16, API-17, BR-20, SEC-08). Pure: no server or browser APIs.

export const MEDIA_KINDS = [
  "photo",
  "spin_frame",
  "engine_audio",
  "inspection_report",
  "og_image",
  "blueprint",
  "logo",
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_TYPES = {
  jpg: "image/jpeg",
  webp: "image/webp",
  png: "image/png",
  wav: "audio/wav",
  pdf: "application/pdf",
} as const;
export type MediaExtension = keyof typeof MEDIA_TYPES;
export type MediaType = (typeof MEDIA_TYPES)[MediaExtension];

// KB and MB are binary units, as in Next.js body limits and the storage SDK (DECISIONS.md D-022)
const KB = 1024;
const MB = 1024 * KB;

// Kinds without variants upload one "src" file, held to this width (API-17)
const SRC_WIDTH = 2560;

type VariantRule = {
  width: number; // nominal width in pixels (API-17)
  maxBytes: number; // per-variant cap (API-16)
  demo: boolean; // a demo session may upload it (BR-20, BR-30)
};

type KindRule = {
  extensions: readonly MediaExtension[];
  variants: Readonly<Record<string, VariantRule>>;
};

// Photos and spin frames are canvas re-encodes, so WebP or the JPEG fallback only (BR-20, BR-21)
const KIND_RULES: Readonly<Record<MediaKind, KindRule>> = {
  photo: {
    extensions: ["webp", "jpg"],
    variants: {
      "480": { width: 480, maxBytes: 150 * KB, demo: true },
      "960": { width: 960, maxBytes: 300 * KB, demo: true },
      "1200": { width: 1200, maxBytes: 500 * KB, demo: false },
      "1600": { width: 1600, maxBytes: 1 * MB, demo: false },
      "2560": { width: 2560, maxBytes: 2 * MB, demo: false },
    },
  },
  spin_frame: {
    extensions: ["webp", "jpg"],
    variants: {
      "480": { width: 480, maxBytes: 28 * KB, demo: true },
      "1280": { width: 1280, maxBytes: 800 * KB, demo: false },
    },
  },
  engine_audio: {
    extensions: ["wav"],
    variants: { src: { width: SRC_WIDTH, maxBytes: Math.floor(1.4 * MB), demo: true } },
  },
  // Dealer roles only; a PDF report may reach REPORT_PDF_MAX_BYTES
  inspection_report: {
    extensions: ["jpg", "png", "webp", "pdf"],
    variants: { src: { width: SRC_WIDTH, maxBytes: 2 * MB, demo: false } },
  },
  og_image: {
    extensions: ["jpg"],
    variants: { src: { width: SRC_WIDTH, maxBytes: 500 * KB, demo: false } },
  },
  blueprint: {
    extensions: ["webp", "png"],
    variants: { src: { width: SRC_WIDTH, maxBytes: 600 * KB, demo: false } },
  },
  logo: {
    extensions: ["png", "webp"],
    variants: { src: { width: SRC_WIDTH, maxBytes: 500 * KB, demo: true } },
  },
};

const REPORT_PDF_MAX_BYTES = 10 * MB;

/** The kinds whose every file is an image, which a ready row gives its pixel size (D-043) */
export const IMAGE_KINDS = MEDIA_KINDS.filter((kind) =>
  KIND_RULES[kind].extensions.every((ext) => MEDIA_TYPES[ext].startsWith("image/")),
);

// Client upload tokens live 10 minutes (API-16)
export const UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000;

/** A pathname's base and extension, split at the last dot with a name before it and an extension after it */
export function splitExtension(pathname: string): { base: string; ext: string } | undefined {
  const dot = pathname.lastIndexOf(".");
  if (dot <= pathname.lastIndexOf("/") + 1 || dot === pathname.length - 1) return undefined;
  return { base: pathname.slice(0, dot), ext: pathname.slice(dot + 1) };
}

export function isMediaExtension(ext: string): ext is MediaExtension {
  return Object.hasOwn(MEDIA_TYPES, ext);
}

export function extensionOf(pathname: string): MediaExtension | undefined {
  const ext = splitExtension(pathname)?.ext;
  return ext !== undefined && isMediaExtension(ext) ? ext : undefined;
}

function variantRule(kind: MediaKind, variant: string): VariantRule | undefined {
  const { variants } = KIND_RULES[kind];
  return Object.hasOwn(variants, variant) ? variants[variant] : undefined;
}

export function nominalWidth(kind: MediaKind, variant: string): number | undefined {
  return variantRule(kind, variant)?.width;
}

// The byte cap for one upload, or undefined when the kind refuses that variant or file type,
// or the variant in a demo session (BR-20, BR-30)
export function maxBytesFor(
  kind: MediaKind,
  variant: string,
  ext: MediaExtension,
  session: { demo: boolean },
): number | undefined {
  const rule = variantRule(kind, variant);
  if (!rule || !KIND_RULES[kind].extensions.includes(ext) || (session.demo && !rule.demo)) return undefined;
  return kind === "inspection_report" && ext === "pdf" ? REPORT_PDF_MAX_BYTES : rule.maxBytes;
}

// The only pathname API-16 signs for one variant: cars/{carId}/{kind}/{clientUploadId}-{variant}.{ext}
export function uploadPathname(input: {
  carId: string;
  kind: MediaKind;
  clientUploadId: string;
  variant: string;
  ext: MediaExtension;
}): string {
  return `cars/${input.carId}/${input.kind}/${input.clientUploadId}-${input.variant}.${input.ext}`;
}

// The store adds "-" plus a random suffix before the extension. Vercel Blob uses 30 letters
// and digits; the check accepts 16 to 64, and the prefix stays fixed to the signed pathname.
export const RANDOM_SUFFIX_LENGTH = 30;
const RANDOM_SUFFIX = /^[A-Za-z0-9]{16,64}$/;

export function isStoredPathnameOf(signedPathname: string, storedPathname: string): boolean {
  const signed = splitExtension(signedPathname);
  if (!signed) return false;
  const base = `${signed.base}-`;
  const ext = `.${signed.ext}`;
  return (
    storedPathname.startsWith(base) &&
    storedPathname.endsWith(ext) &&
    RANDOM_SUFFIX.test(storedPathname.slice(base.length, storedPathname.length - ext.length))
  );
}
