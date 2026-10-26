import { describe, expect, it } from "vitest";
import { validate } from "@/lib/validation/issues";
import { settingsSectionSchemas, settingsUpdateSchema } from "@/lib/validation/settings";

// API-24's sections (FR-35, VR-20 to VR-28), each saved whole

const char = (codePoint: number) => String.fromCodePoint(codePoint);
const arabicIndic = (digits: string) => digits.replace(/\d/g, (digit) => char(0x0660 + Number(digit)));

const OPEN = [{ open: "09:00", close: "21:00", overnight: false }];
const HOURS = {
  sat: OPEN,
  sun: OPEN,
  mon: OPEN,
  tue: OPEN,
  wed: OPEN,
  thu: OPEN,
  fri: [{ ...OPEN[0], open: "14:00" }],
};
const RAMADAN_DAY = [
  { open: "10:00", close: "15:00", overnight: false },
  { open: "20:30", close: "23:30", overnight: false },
];
const RAMADAN_HOURS = { ...HOURS, sat: RAMADAN_DAY, mon: RAMADAN_DAY, fri: "closed" };

const BRAND = {
  brandNameAr: "مفتاح للسيارات",
  brandNameEn: "Muftah Motors",
  taglineAr: null,
  taglineEn: null,
  storyAr: null,
  storyEn: null,
  logoMediaId: null,
  accentPreset: "scan_cyan",
};
const CONTACT = {
  whatsappE164: "+962790000000",
  phoneE164: "+962790000000",
  email: "hello@muftah.example",
  addressAr: "طريق المطار، عمّان، الأردن",
  addressEn: "Airport Road, Amman, Jordan",
  lat: 31.9184,
  lng: 35.8591,
  social: {},
};
const HOURS_SECTION = { hours: HOURS, ramadan: null, closures: [] };
const BASELINE = { sedan: 8, suv: 11, hatchback: 7, pickup: 12, coupe: 9, convertible: 9.5, van: 12, truck: 16 };
const PRICES = {
  fuelPrice90: 1.05,
  fuelPrice95: 1.36,
  fuelPrice98: 1.51,
  fuelPriceDiesel: 0.9,
  elecHomeOffpeakKwh: 0.108,
  elecHomePeakKwh: 0.16,
  elecPublicKwh: 0.133,
  baselineLPer100km: BASELINE,
};
const CAR_ID = "0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b";
const SHOWCASE = { heroCarId: CAR_ID, heroMediaId: null, heroMarks: null, featuredCarIds: [CAR_ID] };
const ADVANCED = {
  soldVisibleDays: 14,
  mileageBands: { low: 12000, high: 25000 },
  micronBands: { factoryMax: 180, refinishMax: 300 },
};

type Section = keyof typeof settingsSectionSchemas;

/** The section's issues, or "ok" */
function issues(section: Section, values: object): unknown {
  const result = validate(settingsSectionSchemas[section], values);
  return result.ok ? "ok" : result.fieldErrors;
}

/** The section's parsed values */
function parsed(section: Section, values: object): unknown {
  const result = validate(settingsSectionSchemas[section], values);
  if (!result.ok) throw new Error(JSON.stringify(result.fieldErrors));
  return result.data;
}

describe("the brand section", () => {
  it("takes the seed's brand", () => {
    expect(parsed("brand", BRAND)).toStrictEqual(BRAND);
  });

  it("VR-21: names of 2 to 60 characters", () => {
    expect(parsed("brand", { ...BRAND, brandNameEn: "Mu" })).toMatchObject({ brandNameEn: "Mu" });
    expect(parsed("brand", { ...BRAND, brandNameEn: "M".repeat(60) })).toMatchObject({ brandNameEn: "M".repeat(60) });
    expect(issues("brand", { ...BRAND, brandNameEn: "M" })).toStrictEqual({
      brandNameEn: [{ key: "validation.nameLength" }],
    });
    expect(issues("brand", { ...BRAND, brandNameAr: "م".repeat(61) })).toStrictEqual({
      brandNameAr: [{ key: "validation.nameLength" }],
    });
    expect(issues("brand", { ...BRAND, brandNameAr: "" })).toStrictEqual({
      brandNameAr: [{ key: "validation.required" }],
    });
  });

  it("VR-32: a story of up to 1,000 characters in each language, its line breaks kept (FR-27)", () => {
    const story = `${"م".repeat(600)}\n\n${"م".repeat(398)}`;
    expect(parsed("brand", { ...BRAND, storyAr: story })).toStrictEqual({ ...BRAND, storyAr: story });
    for (const name of ["storyAr", "storyEn"]) {
      expect(parsed("brand", { ...BRAND, [name]: "s".repeat(1000) }), name).toStrictEqual({
        ...BRAND,
        [name]: "s".repeat(1000),
      });
      expect(issues("brand", { ...BRAND, [name]: "s".repeat(1001) }), name).toStrictEqual({
        [name]: [{ key: "validation.maxChars", values: { max: 1000 } }],
      });
    }
    expect(parsed("brand", { ...BRAND, storyEn: "   " })).toStrictEqual(BRAND);
  });

  it("keeps each tagline to 120 characters (ENT-DealerSettings)", () => {
    for (const name of ["taglineAr", "taglineEn"]) {
      expect(parsed("brand", { ...BRAND, [name]: "T".repeat(120) }), name).toMatchObject({ [name]: "T".repeat(120) });
      expect(issues("brand", { ...BRAND, [name]: "T".repeat(121) }), name).toStrictEqual({
        [name]: [{ key: "validation.maxChars", values: { max: 120 } }],
      });
    }
  });

  it("takes an accent from the presets only (FR-35.3)", () => {
    expect(issues("brand", { ...BRAND, accentPreset: "#00e5ff" })).toStrictEqual({
      accentPreset: [{ key: "validation.invalid" }],
    });
  });
});

describe("the contact section", () => {
  it("takes the seed's contact details", () => {
    expect(parsed("contact", CONTACT)).toStrictEqual(CONTACT);
  });

  it("VR-20: an E.164 number, typed with spaces, isolates or Arabic digits, stored without them", () => {
    // As copied from the Arabic message's example, which isolates the number
    const typed = `${char(0x2066)}+962 ${arabicIndic("79")} ${arabicIndic("123")} 4567${char(0x2069)}`;
    expect(parsed("contact", { ...CONTACT, whatsappE164: typed, phoneE164: "+962-6-555-0000" })).toMatchObject({
      whatsappE164: "+962791234567",
      phoneE164: "+96265550000",
    });
    // Eight to fifteen digits after the +, the first not 0, where z.e164 would take seven
    for (const edge of ["+12345678", "+123456789012345"]) {
      expect(parsed("contact", { ...CONTACT, phoneE164: edge }), edge).toMatchObject({ phoneE164: edge });
    }
    for (const wrong of ["+1234567", "+0962790000000", "0790000000", "+9627900000001234", "+962 79O 000 000"]) {
      expect(issues("contact", { ...CONTACT, phoneE164: wrong }), wrong).toStrictEqual({
        phoneE164: [{ key: "validation.phone" }],
      });
    }
    expect(parsed("contact", { ...CONTACT, whatsappE164: "" })).toMatchObject({ whatsappE164: null });
    expect(issues("contact", { ...CONTACT, phoneE164: 962790000000 })).toStrictEqual({
      phoneE164: [{ key: "validation.invalid" }],
    });
  });

  it("VR-22: a basic email address of up to 254 characters, or none", () => {
    expect(parsed("contact", { ...CONTACT, email: null })).toMatchObject({ email: null });
    expect(issues("contact", { ...CONTACT, email: "hello at muftah" })).toStrictEqual({
      email: [{ key: "validation.email" }],
    });
    const email = (length: number) =>
      `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(length - 197)}.com`;
    expect([...email(254)]).toHaveLength(254);
    expect(parsed("contact", { ...CONTACT, email: email(254) })).toMatchObject({ email: email(254) });
    expect(issues("contact", { ...CONTACT, email: email(255) })).toStrictEqual({
      email: [{ key: "validation.email" }],
    });
  });

  it("VR-23: coordinates within range, both or neither", () => {
    expect(parsed("contact", { ...CONTACT, lat: null, lng: null })).toMatchObject({ lat: null, lng: null });
    expect(parsed("contact", { ...CONTACT, lat: -90, lng: -180 })).toMatchObject({ lat: -90, lng: -180 });
    expect(parsed("contact", { ...CONTACT, lat: 90, lng: 180 })).toMatchObject({ lat: 90, lng: 180 });
    for (const lat of [-90.000001, 90.000001]) {
      expect(issues("contact", { ...CONTACT, lat }), String(lat)).toStrictEqual({
        lat: [{ key: "validation.coordinates" }],
      });
    }
    for (const lng of [-180.000001, 180.000001]) {
      expect(issues("contact", { ...CONTACT, lng }), String(lng)).toStrictEqual({
        lng: [{ key: "validation.coordinates" }],
      });
    }
    expect(issues("contact", { ...CONTACT, lng: null })).toStrictEqual({
      lng: [{ key: "validation.coordinates" }],
    });
    expect(issues("contact", { ...CONTACT, lat: null })).toStrictEqual({
      lat: [{ key: "validation.coordinates" }],
    });
  });

  it("VR-24: each network's https link, with www. or m. allowed (owner, 24 Oct 2026)", () => {
    const social = {
      instagram: "https://www.instagram.com/muftah.motors",
      facebook: "https://m.facebook.com/muftahmotors",
      tiktok: "https://tiktok.com/@muftah",
    };
    expect(parsed("contact", { ...CONTACT, social })).toMatchObject({ social });
    expect(parsed("contact", { ...CONTACT, social: { instagram: "", facebook: "  ", tiktok: null } })).toMatchObject({
      social: {},
    });
    expect(issues("contact", { ...CONTACT, social: "https://instagram.com/muftah" })).toStrictEqual({
      social: [{ key: "validation.invalid" }],
    });
    const wrong = [
      "http://instagram.com/muftah",
      "https://instagram.com/",
      "https://instagram.com.example.com/muftah",
      "https://example.com/instagram.com/muftah",
      "https://business.instagram.com/muftah",
      "https://user:secret@instagram.com/muftah",
      "https://instagram.com:8443/muftah",
      "https://facebook.com/muftah",
      "instagram.com/muftah",
    ];
    for (const url of wrong) {
      expect(issues("contact", { ...CONTACT, social: { instagram: url } }), url).toStrictEqual({
        "social.instagram": [{ key: "validation.socialUrl" }],
      });
    }
  });

  it("VR-24: saves the link as it parses, so every reader of it opens the same page", () => {
    const saved = (instagram: string) => parsed("contact", { ...CONTACT, social: { instagram } });
    const forms = [
      "https:instagram.com/muftah",
      "https:/instagram.com/muftah",
      String.raw`https:\\instagram.com\muftah`,
      "https://instagram.com:443/muftah",
      "https://@instagram.com/muftah",
      "HTTPS://INSTAGRAM.COM/muftah",
    ];
    for (const typed of forms) {
      expect(saved(typed), typed).toMatchObject({ social: { instagram: "https://instagram.com/muftah" } });
    }
    expect(saved("https://instagram.com/mu ftah")).toMatchObject({
      social: { instagram: "https://instagram.com/mu%20ftah" },
    });

    // Up to 200 characters both as typed and as saved (D-043)
    const longest = `https://instagram.com/${"a".repeat(178)}`;
    expect(saved(longest)).toMatchObject({ social: { instagram: longest } });
    // 201 as typed, though it saves at 197 without its port
    const typedLong = `https://instagram.com:443/${"a".repeat(175)}`;
    expect([[...typedLong].length, new URL(typedLong).href.length]).toStrictEqual([201, 197]);
    // 199 as typed, but 201 as saved, its space written %20
    const savedLong = `https://instagram.com/${"a".repeat(88)} ${"a".repeat(88)}`;
    expect([[...savedLong].length, new URL(savedLong).href.length]).toStrictEqual([199, 201]);
    for (const instagram of [`${longest}a`, typedLong, savedLong]) {
      expect(issues("contact", { ...CONTACT, social: { instagram } }), instagram).toStrictEqual({
        "social.instagram": [{ key: "validation.socialUrl" }],
      });
    }
  });

  it("keeps each address to 200 characters (ENT-DealerSettings)", () => {
    for (const name of ["addressAr", "addressEn"]) {
      expect(parsed("contact", { ...CONTACT, [name]: "A".repeat(200) }), name).toMatchObject({
        [name]: "A".repeat(200),
      });
      expect(issues("contact", { ...CONTACT, [name]: "A".repeat(201) }), name).toStrictEqual({
        [name]: [{ key: "validation.maxChars", values: { max: 200 } }],
      });
    }
  });
});

describe("the hours section", () => {
  it("takes the default week and the seed's Ramadan schedule across a month's end", () => {
    const ramadan = { start: "2027-02-08", end: "2027-03-09", hours: RAMADAN_HOURS };
    expect(parsed("hours", { ...HOURS_SECTION, ramadan })).toStrictEqual({ ...HOURS_SECTION, ramadan });
  });

  it("VR-26: closing after opening, unless the period runs overnight", () => {
    const day = (periods: unknown) => issues("hours", { ...HOURS_SECTION, hours: { ...HOURS, mon: periods } });
    expect(day([{ open: "20:00", close: "02:00", overnight: true }])).toBe("ok");
    expect(day([{ open: "20:00", close: "00:00", overnight: true }])).toBe("ok");
    expect(day([{ open: "09:00", close: "08:59", overnight: true }])).toBe("ok");
    expect(day([{ open: "09:00", close: "09:01", overnight: false }])).toBe("ok");
    expect(day([{ open: "21:00", close: "09:00", overnight: false }])).toStrictEqual({
      "hours.mon.0.close": [{ key: "validation.hours" }],
    });
    expect(day([{ open: "09:00", close: "09:00", overnight: false }])).toStrictEqual({
      "hours.mon.0.close": [{ key: "validation.hours" }],
    });
    expect(day([{ open: "09:00", close: "21:00", overnight: true }])).toStrictEqual({
      "hours.mon.0.close": [{ key: "validation.hours" }],
    });
    expect(day([{ open: "09:00", close: "09:00", overnight: true }])).toStrictEqual({
      "hours.mon.0.close": [{ key: "validation.hours" }],
    });
  });

  it("VR-26: at most two periods a day, which never overlap", () => {
    const day = (periods: unknown) => issues("hours", { ...HOURS_SECTION, hours: { ...HOURS, mon: periods } });
    expect(day(RAMADAN_DAY)).toBe("ok");
    expect(
      day([
        { open: "10:00", close: "14:00", overnight: false },
        { open: "14:00", close: "18:00", overnight: false },
      ]),
    ).toBe("ok");
    expect(
      day([
        { open: "14:00", close: "18:00", overnight: false },
        { open: "10:00", close: "14:00", overnight: false },
      ]),
    ).toBe("ok");
    // A minute shared, in either order
    for (const periods of [
      [
        { open: "10:00", close: "14:00", overnight: false },
        { open: "13:59", close: "18:00", overnight: false },
      ],
      [
        { open: "13:59", close: "18:00", overnight: false },
        { open: "10:00", close: "14:00", overnight: false },
      ],
    ]) {
      expect(day(periods), periods[0]?.open).toStrictEqual({ "hours.mon.1": [{ key: "validation.hoursOverlap" }] });
    }
    expect(
      day([
        { open: "10:00", close: "15:00", overnight: false },
        { open: "14:00", close: "18:00", overnight: false },
      ]),
    ).toStrictEqual({ "hours.mon.1": [{ key: "validation.hoursOverlap" }] });
    expect(
      day([
        { open: "22:00", close: "23:00", overnight: false },
        { open: "20:00", close: "01:00", overnight: true },
      ]),
    ).toStrictEqual({ "hours.mon.1": [{ key: "validation.hoursOverlap" }] });
    expect(day([...RAMADAN_DAY, { open: "23:40", close: "23:50", overnight: false }])).toStrictEqual({
      "hours.mon": [{ key: "validation.invalid" }],
    });
    expect(day([])).toStrictEqual({ "hours.mon": [{ key: "validation.invalid" }] });
  });

  it("VR-26: times as HH:MM on the 24-hour clock, typed in any digits", () => {
    const day = (open: string) =>
      issues("hours", { ...HOURS_SECTION, hours: { ...HOURS, mon: [{ open, close: "21:00", overnight: false }] } });
    expect(day(arabicIndic("09:30"))).toBe("ok");
    for (const wrong of ["9:00", "24:00", "09:60", "9am"]) {
      expect(day(wrong), wrong).toStrictEqual({ "hours.mon.0.open": [{ key: "validation.invalid" }] });
    }
  });

  it("VR-27: Ramadan dates in order, at most 35 days counting both ends", () => {
    const ramadan = (start: string, end: string) =>
      issues("hours", { ...HOURS_SECTION, ramadan: { start, end, hours: RAMADAN_HOURS } });
    expect(ramadan("2027-02-08", "2027-02-08")).toBe("ok");
    expect(ramadan("2027-02-08", "2027-03-14")).toBe("ok");
    expect(ramadan("2027-02-08", "2027-03-15")).toStrictEqual({ "ramadan.end": [{ key: "validation.ramadan" }] });
    expect(ramadan("2027-03-09", "2027-02-08")).toStrictEqual({ "ramadan.end": [{ key: "validation.ramadan" }] });
    expect(ramadan("2027-02-08", "2027-02-07")).toStrictEqual({ "ramadan.end": [{ key: "validation.ramadan" }] });
  });

  it("keeps one closure a day, in date order, with notes of up to 80 characters (D-043)", () => {
    const closures = [
      { date: "2027-01-01", note_ar: "رأس السنة", note_en: "New Year" },
      { date: "2026-12-25", note_ar: null, note_en: "Christmas" },
      { date: "2027-05-25", note_ar: null, note_en: "Independence Day" },
      { date: "2027-05-01", note_ar: null, note_en: "Labour Day" },
    ];
    expect(parsed("hours", { ...HOURS_SECTION, closures })).toMatchObject({
      closures: [closures[1], closures[0], closures[3], closures[2]],
    });
    expect(issues("hours", { ...HOURS_SECTION, closures: [...closures, closures[0]] })).toStrictEqual({
      "closures.4.date": [{ key: "validation.invalid" }],
    });
    for (const name of ["note_ar", "note_en"]) {
      const noted = (length: number) => [
        { date: "2027-01-01", note_ar: null, note_en: null, [name]: "N".repeat(length) },
      ];
      expect(issues("hours", { ...HOURS_SECTION, closures: noted(80) }), name).toBe("ok");
      expect(issues("hours", { ...HOURS_SECTION, closures: noted(81) }), name).toStrictEqual({
        [`closures.0.${name}`]: [{ key: "validation.maxChars", values: { max: 80 } }],
      });
    }
  });

  it("keeps up to 60 closures (D-043)", () => {
    const days = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        date: new Date(Date.UTC(2027, 0, 1 + index)).toISOString().slice(0, 10),
        note_ar: null,
        note_en: null,
      }));
    expect(issues("hours", { ...HOURS_SECTION, closures: days(60) })).toBe("ok");
    expect(issues("hours", { ...HOURS_SECTION, closures: days(61) })).toStrictEqual({
      closures: [{ key: "validation.invalid" }],
    });
  });
});

describe("the prices section", () => {
  it("takes the October 2026 sheet", () => {
    expect(parsed("prices", PRICES)).toStrictEqual(PRICES);
  });

  it("VR-25: unit prices from 0.050 to 5.000 JOD, to three decimals", () => {
    expect(parsed("prices", { ...PRICES, fuelPrice90: 0.05, fuelPrice95: 5, fuelPrice98: "1.0555" })).toMatchObject({
      fuelPrice90: 0.05,
      fuelPrice95: 5,
      fuelPrice98: 1.056,
    });
    for (const wrong of [0.049, 5.001]) {
      expect(issues("prices", { ...PRICES, elecPublicKwh: wrong }), String(wrong)).toStrictEqual({
        elecPublicKwh: [{ key: "validation.unitPrice" }],
      });
    }
  });

  it("takes a baseline for every body type, within VR-10's range", () => {
    expect(parsed("prices", { ...PRICES, baselineLPer100km: { ...BASELINE, coupe: 9.55 } })).toMatchObject({
      baselineLPer100km: { coupe: 9.6 },
    });
    expect(issues("prices", { ...PRICES, baselineLPer100km: { ...BASELINE, van: 0.5 } })).toStrictEqual({
      "baselineLPer100km.van": [{ key: "validation.range", values: { min: 1, max: 40 } }],
    });
    const noTruck = Object.fromEntries(Object.entries(BASELINE).filter(([bodyType]) => bodyType !== "truck"));
    expect(issues("prices", { ...PRICES, baselineLPer100km: noTruck })).toStrictEqual({
      "baselineLPer100km.truck": [{ key: "validation.required" }],
    });
    // An unknown body type is dropped, as every unknown key is (SRS §8.1)
    expect(parsed("prices", { ...PRICES, baselineLPer100km: { ...BASELINE, bus: 20 } })).toStrictEqual(PRICES);
  });
});

describe("the showcase section", () => {
  it("takes a hero car with its marks as fractions of the photo (FR-35.6)", () => {
    const heroMarks = { front: 0.08, rear: 0.94, wheelFront: 0.2, wheelRear: 0.78, ground: 0.86 };
    expect(parsed("showcase", { ...SHOWCASE, heroMarks })).toStrictEqual({ ...SHOWCASE, heroMarks });
    expect(issues("showcase", { ...SHOWCASE, heroMarks: { ...heroMarks, ground: 1.2 } })).toStrictEqual({
      "heroMarks.ground": [{ key: "validation.invalid" }],
    });
  });

  it("VR-28: up to 8 featured cars, each once", () => {
    const ids = Array.from(
      { length: 9 },
      (_, index) => `0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a${String(index).padStart(2, "0")}`,
    );
    expect(parsed("showcase", { ...SHOWCASE, featuredCarIds: ids.slice(0, 8) })).toMatchObject({
      featuredCarIds: ids.slice(0, 8),
    });
    expect(issues("showcase", { ...SHOWCASE, featuredCarIds: ids })).toStrictEqual({
      featuredCarIds: [{ key: "validation.featured" }],
    });
    expect(issues("showcase", { ...SHOWCASE, featuredCarIds: [CAR_ID, CAR_ID] })).toStrictEqual({
      featuredCarIds: [{ key: "validation.invalid" }],
    });
    expect(issues("showcase", { ...SHOWCASE, featuredCarIds: [CAR_ID.toUpperCase(), CAR_ID] })).toStrictEqual({
      featuredCarIds: [{ key: "validation.invalid" }],
    });
  });

  it("keeps ids in lower case, so one id can't count as two (D-043)", () => {
    expect(parsed("showcase", { ...SHOWCASE, heroCarId: CAR_ID.toUpperCase() })).toMatchObject({ heroCarId: CAR_ID });
  });
});

describe("the advanced section", () => {
  it("takes the defaults", () => {
    expect(parsed("advanced", ADVANCED)).toStrictEqual(ADVANCED);
  });

  it("keeps sold cars visible 0 to 60 days (BR-04)", () => {
    for (const days of [0, 60]) {
      expect(issues("advanced", { ...ADVANCED, soldVisibleDays: days }), String(days)).toBe("ok");
    }
    for (const wrong of [-1, 61]) {
      expect(issues("advanced", { ...ADVANCED, soldVisibleDays: wrong }), String(wrong)).toStrictEqual({
        soldVisibleDays: [{ key: "validation.range", values: { min: 0, max: 60 } }],
      });
    }
  });

  it("keeps each band's ends in order, within VR-03's and VR-12's ranges", () => {
    expect(issues("advanced", { ...ADVANCED, mileageBands: { low: 24999, high: 25000 } })).toBe("ok");
    expect(issues("advanced", { ...ADVANCED, mileageBands: { low: 25000, high: 25000 } })).toStrictEqual({
      "mileageBands.high": [{ key: "validation.invalid" }],
    });
    expect(issues("advanced", { ...ADVANCED, mileageBands: { low: -1, high: 25000 } })).toStrictEqual({
      "mileageBands.low": [{ key: "validation.km" }],
    });
    expect(issues("advanced", { ...ADVANCED, micronBands: { factoryMax: 300, refinishMax: 180 } })).toStrictEqual({
      "micronBands.refinishMax": [{ key: "validation.invalid" }],
    });
    expect(issues("advanced", { ...ADVANCED, micronBands: { factoryMax: 180, refinishMax: 181 } })).toBe("ok");
    expect(issues("advanced", { ...ADVANCED, micronBands: { factoryMax: 180, refinishMax: 180 } })).toStrictEqual({
      "micronBands.refinishMax": [{ key: "validation.invalid" }],
    });
    expect(issues("advanced", { ...ADVANCED, micronBands: { factoryMax: 180, refinishMax: 2001 } })).toStrictEqual({
      "micronBands.refinishMax": [{ key: "validation.microns" }],
    });
  });
});

describe("updateSettings' input", () => {
  it("validates the values of the section it names", () => {
    expect(validate(settingsUpdateSchema, { section: "advanced", values: ADVANCED })).toStrictEqual({
      ok: true,
      data: { section: "advanced", values: ADVANCED },
    });
    expect(validate(settingsUpdateSchema, { section: "advanced", values: BRAND })).toMatchObject({ ok: false });
    expect(validate(settingsUpdateSchema, { section: "billing", values: {} })).toMatchObject({ ok: false });
  });
});
