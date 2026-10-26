import { MILESTONE_TYPES, TITLE_BRANDS } from "../db/enums.ts";
import { ammanDate } from "../format/calendar.ts";
import { MILESTONES_MAX } from "./bounds.ts";
import { bothCoordinates, calendarMonth, latitude, longitude, orNull, recordId, text } from "./fields.ts";
import { addIssue } from "./issues.ts";
import { z } from "./zod.ts";

// API-20's journey (FR-40): the milestones in their order, each with a place and a month, either of
// which may be unknown (FR-40's edge cases), and the custom places a dealer adds to the presets
// (BR-38)

const note = orNull(text({ max: 240 }));

/** VR-14: a month, stored as its first day, no later than this month in Amman */
function pastMonth(now: Date) {
  const thisMonth = `${ammanDate(now).slice(0, 7)}-01`;
  return calendarMonth().check((payload) => {
    if (payload.value > thisMonth) addIssue(payload, { key: "validation.futureDate" });
  });
}

function milestone(now: Date) {
  return z
    .object({
      type: z.enum(MILESTONE_TYPES),
      placeId: recordId().nullable(),
      occurredMonth: orNull(pastMonth(now)),
      noteAr: note.optional(),
      noteEn: note.optional(),
      auctionHouse: orNull(text({ max: 60 })).optional(),
      titleBrand: orNull(z.enum(TITLE_BRANDS)).optional(),
      damageNoteAr: note.optional(),
      damageNoteEn: note.optional(),
    })
    .check((payload) => {
      // VR-15
      const { type, titleBrand } = payload.value;
      if (type === "auction" && (titleBrand === null || titleBrand === undefined)) {
        addIssue(payload, { key: "validation.titleBrand" }, ["titleBrand"]);
      }
    });
}

/** API-20's milestones, within VR-14's cap, as of now */
export function journeySchema(now: Date) {
  return z.object({
    milestones: z.array(milestone(now)).max(MILESTONES_MAX, { error: "validation.milestonesMax" }),
  });
}

export type JourneyInput = z.output<ReturnType<typeof journeySchema>>;

/** A dealer's own place: both names, as the place table keeps both, and coordinates or none */
export const customPlaceSchema = z
  .object({
    nameAr: text({ max: 80 }),
    nameEn: text({ max: 80 }),
    lat: orNull(latitude()),
    lng: orNull(longitude()),
  })
  .check(bothCoordinates);

export type CustomPlaceInput = z.output<typeof customPlaceSchema>;
