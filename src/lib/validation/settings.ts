import { ACCENT_PRESETS, type BODY_TYPES } from "../db/enums.ts";
import { normalizeDigits } from "../i18n/normalize.ts";
import { BRAND_NAME_CHARS, FEATURED_CARS_MAX, SOLD_VISIBLE_DAYS, STORY_MAX_CHARS, UNIT_PRICE_JOD } from "./bounds.ts";
import {
  between,
  bothCoordinates,
  calendarDate,
  decimal,
  distinct,
  emailAddress,
  fraction,
  kilometres,
  latitude,
  litresPer100km,
  longitude,
  microns,
  orNull,
  recordId,
  text,
  typed,
} from "./fields.ts";
import { addIssue } from "./issues.ts";
import { z } from "./zod.ts";

// The dealer's settings, in the six sections API-24 saves one at a time (FR-35, VR-20 to VR-28).
// The JSON columns of SRS §6.2 take their shapes from here.

// Brand

const brandName = text({ ...BRAND_NAME_CHARS, issue: { key: "validation.nameLength" } });

const brand = z.object({
  brandNameAr: brandName,
  brandNameEn: brandName,
  taglineAr: orNull(text({ max: 120 })),
  taglineEn: orNull(text({ max: 120 })),
  // VR-32: the Visit page's story (FR-27), its line breaks kept
  storyAr: orNull(text({ max: STORY_MAX_CHARS, multiline: true })),
  storyEn: orNull(text({ max: STORY_MAX_CHARS, multiline: true })),
  logoMediaId: recordId().nullable(),
  // FR-35.3: the presets only, as each passes contrast on the dark surfaces
  accentPreset: z.enum(ACCENT_PRESETS),
});

// Contact

/** A number as phones and copies show it, without its spaces, dashes, brackets and direction marks */
function readPhone(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const phone = normalizeDigits(value).replace(/[\s\p{Cf}\p{Pd}()]/gu, "");
  return phone === "" ? null : phone;
}

// VR-20: + and 8 to 15 digits, the first not 0, as the column's check reads it. Zod's e164 takes 7.
const phone = z.preprocess(
  readPhone,
  z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, { error: "validation.phone" })
    .nullable(),
);

const SOCIAL_HOSTS = { instagram: "instagram.com", facebook: "facebook.com", tiktok: "tiktok.com" } as const;

/** Whether the link is https to a page on one of the hosts, with no name, password or port in it */
function isProfileLink(link: string, hosts: readonly string[]): boolean {
  let url: URL;
  try {
    // URL.canParse is newer than Safari 16.4 (C-09)
    url = new URL(link);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    hosts.includes(url.hostname) &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    url.pathname !== "/"
  );
}

// VR-24: the network's own https link to a page, with www. or m. before its host (owner, 24 Oct 2026),
// saved as the link it parses to, so a page's link and a reader parsing it on its own open the same
// page; up to 200 characters as typed and as saved
function socialLink(host: string) {
  const hosts = [host, `www.${host}`, `m.${host}`];
  return text({ max: 200, issue: { key: "validation.socialUrl" } })
    .check((payload) => {
      if (!isProfileLink(payload.value, hosts)) addIssue(payload, { key: "validation.socialUrl" });
    })
    .transform((link) => new URL(link).href)
    .pipe(z.string().max(200, { error: "validation.socialUrl" }));
}

/** The links given: a network left empty has none */
function givenLinks(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([, link]) => typed(link) !== null));
}

const social = z.preprocess(
  givenLinks,
  z.object({
    instagram: socialLink(SOCIAL_HOSTS.instagram).optional(),
    facebook: socialLink(SOCIAL_HOSTS.facebook).optional(),
    tiktok: socialLink(SOCIAL_HOSTS.tiktok).optional(),
  }),
);

const contact = z
  .object({
    whatsappE164: phone,
    phoneE164: phone,
    email: orNull(emailAddress()),
    addressAr: orNull(text({ max: 200 })),
    addressEn: orNull(text({ max: 200 })),
    lat: orNull(latitude()),
    lng: orNull(longitude()),
    social,
  })
  .check(bothCoordinates);

// Hours (BR-32)

const DAYS = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"] as const;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DAY_MINUTES = 24 * 60;

// HH:MM on the 24-hour clock, typed in any digits
const time = z.preprocess(typed, z.string().regex(TIME));
const period = z.object({ open: time, close: time, overnight: z.boolean() });
const day = z.union([z.literal("closed"), z.array(period).min(1).max(2)]);

type Period = z.output<typeof period>;

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

/** Closes after it opens, or before it on the clock when it runs overnight */
const inOrder = ({ open, close, overnight }: Period) =>
  overnight ? minutes(close) < minutes(open) : minutes(open) < minutes(close);

/** Whether two periods share a minute, an overnight one running into the next day */
function overlap(first: Period, second: Period): boolean {
  const end = (period: Period) => minutes(period.close) + (period.overnight ? DAY_MINUTES : 0);
  return minutes(first.open) < end(second) && minutes(second.open) < end(first);
}

// VR-26 for each day. The rules read two fields, so they sit on the week rather than inside the
// union of a day, where Zod would fold their messages into one; a day with a time already refused
// is left to that message.
const weeklyHours = z
  .object({ sat: day, sun: day, mon: day, tue: day, wed: day, thu: day, fri: day })
  .check((payload) => {
    for (const name of DAYS) {
      const periods = payload.value[name];
      if (periods === "closed") continue;
      if (!periods.every((each) => TIME.test(each.open) && TIME.test(each.close))) continue;
      periods.forEach((each, index) => {
        if (!inOrder(each)) addIssue(payload, { key: "validation.hours" }, [name, index, "close"]);
      });
      const [first, second] = periods;
      if (first && second && inOrder(first) && inOrder(second) && overlap(first, second)) {
        addIssue(payload, { key: "validation.hoursOverlap" }, [name, 1]);
      }
    }
  });

const DAY_MS = DAY_MINUTES * 60 * 1000;

// VR-27: from start to end, at most 35 days counting both
const ramadanSchedule = z
  .object({ start: calendarDate(), end: calendarDate(), hours: weeklyHours })
  .check((payload) => {
    const days = (Date.parse(payload.value.end) - Date.parse(payload.value.start)) / DAY_MS + 1;
    if (days < 1 || days > 35) addIssue(payload, { key: "validation.ramadan" }, ["end"]);
  });

// A year's holidays, each day its own closure
const closure = z.object({
  date: calendarDate(),
  note_ar: orNull(text({ max: 80 })),
  note_en: orNull(text({ max: 80 })),
});

const closures = z
  .array(closure)
  .max(60)
  .check((payload) => {
    const dates = new Set<string>();
    payload.value.forEach(({ date }, index) => {
      if (dates.has(date)) addIssue(payload, { key: "validation.invalid" }, [index, "date"]);
      dates.add(date);
    });
  })
  .transform((list) => [...list].sort((first, second) => (first.date < second.date ? -1 : 1)));

const hours = z.object({ hours: weeklyHours, ramadan: ramadanSchedule.nullable(), closures });

// Fuel and electricity prices

// VR-25: JOD per litre or kWh, to three decimals as numeric(6, 3) holds it. Each is needed, as Cost
// to Run reads them all (BR-11).
const unitPrice = decimal({ ...UNIT_PRICE_JOD, scale: 3, issue: { key: "validation.unitPrice" } });

// The baseline of BR-11 for each body type, within VR-10's range
const baselineLPer100km = z.object({
  suv: litresPer100km(),
  sedan: litresPer100km(),
  hatchback: litresPer100km(),
  pickup: litresPer100km(),
  coupe: litresPer100km(),
  convertible: litresPer100km(),
  van: litresPer100km(),
  truck: litresPer100km(),
} satisfies Record<(typeof BODY_TYPES)[number], z.ZodType>);

const prices = z.object({
  fuelPrice90: unitPrice,
  fuelPrice95: unitPrice,
  fuelPrice98: unitPrice,
  fuelPriceDiesel: unitPrice,
  elecHomeOffpeakKwh: unitPrice,
  elecHomePeakKwh: unitPrice,
  elecPublicKwh: unitPrice,
  baselineLPer100km,
});

// Showcase

// FR-35.6: the blueprint's marks on the hero photo, x for the first four and y for the ground line
const heroMarks = z.object({
  front: fraction(),
  rear: fraction(),
  wheelFront: fraction(),
  wheelRear: fraction(),
  ground: fraction(),
});

const showcase = z.object({
  heroCarId: recordId().nullable(),
  heroMediaId: recordId().nullable(),
  heroMarks: heroMarks.nullable(),
  // VR-28: within its cap, each once. Whether each is published is checked against the cars at save
  // (T-34).
  featuredCarIds: z.array(recordId()).check((payload) => {
    if (payload.value.length > FEATURED_CARS_MAX) addIssue(payload, { key: "validation.featured" });
    else if (!distinct(payload.value)) addIssue(payload, { key: "validation.invalid" });
  }),
});

// Advanced

// BR-06's bands, within VR-03's range, low below high
const mileageBands = z.object({ low: kilometres(), high: kilometres() }).check((payload) => {
  if (payload.value.low >= payload.value.high) addIssue(payload, { key: "validation.invalid" }, ["high"]);
});

// BR-08's bands, within VR-12's range, a factory finish below a refinish
const micronBands = z.object({ factoryMax: microns(), refinishMax: microns() }).check((payload) => {
  if (payload.value.factoryMax >= payload.value.refinishMax) {
    addIssue(payload, { key: "validation.invalid" }, ["refinishMax"]);
  }
});

const advanced = z.object({
  // BR-04
  soldVisibleDays: between(SOLD_VISIBLE_DAYS),
  mileageBands,
  micronBands,
});

export const settingsSectionSchemas = { brand, contact, hours, prices, showcase, advanced };

type Sections = typeof settingsSectionSchemas;

const update = <Section extends keyof Sections>(section: Section) =>
  z.object({ section: z.literal(section), values: settingsSectionSchemas[section] });

/** API-24's input: a section and its values, saved whole */
export const settingsUpdateSchema = z.discriminatedUnion("section", [
  update("brand"),
  update("contact"),
  update("hours"),
  update("prices"),
  update("showcase"),
  update("advanced"),
]);

export type SocialLinks = z.output<typeof social>;
export type WeeklyHours = z.output<typeof weeklyHours>;
export type RamadanSchedule = z.output<typeof ramadanSchedule>;
export type Closure = z.output<typeof closure>;
export type BaselineConsumption = z.output<typeof baselineLPer100km>;
export type HeroMarks = z.output<typeof heroMarks>;
export type MileageBands = z.output<typeof mileageBands>;
export type MicronBands = z.output<typeof micronBands>;
