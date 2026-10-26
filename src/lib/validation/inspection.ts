import { MECH_STATES, PANEL_IDS, PANEL_STATES } from "../db/enums.ts";
import { ammanDate } from "../format/calendar.ts";
import { calendarDate, distinct, microns, orNull, recordId, text } from "./fields.ts";
import { addIssue } from "./issues.ts";
import { z } from "./zod.ts";

// API-19's inspection (FR-37): the report's details, the three mechanical items and the 13 panels.
// A panel's reading, notes and close-up may be left out. Whether a state fits its reading is a
// warning (BR-08), which the action returns beside the saved inspection.

const note = orNull(text({ max: 200 }));

/** ENT-Inspection: a date no later than today in Amman */
function pastDate(now: Date) {
  const today = ammanDate(now);
  return calendarDate().check((payload) => {
    if (payload.value > today) addIssue(payload, { key: "validation.futureDate" });
  });
}

function meta(now: Date) {
  return z.object({
    inspectedOn: orNull(pastDate(now)),
    testCenterName: orNull(text({ max: 80 })),
    reportMediaId: recordId().nullable(),
  });
}

const mechanicalItem = z.object({ state: z.enum(MECH_STATES), noteAr: note, noteEn: note });

const panel = z.object({
  panelId: z.enum(PANEL_IDS),
  state: z.enum(PANEL_STATES),
  // VR-12, and none for a plastic panel
  microns: orNull(microns()).optional(),
  noteAr: note.optional(),
  noteEn: note.optional(),
  closeupMediaId: recordId().nullable().optional(),
});

/** API-19's inspection, as of now */
export function inspectionSchema(now: Date) {
  return z.object({
    meta: meta(now),
    mechanical: z.object({ chassis: mechanicalItem, engine: mechanicalItem, gearbox: mechanicalItem }),
    // Each of the 13 panels once (TC-37-4)
    panels: z.array(panel).check((payload) => {
      const ids = payload.value.map(({ panelId }) => panelId);
      if (ids.length !== PANEL_IDS.length || !distinct(ids)) addIssue(payload, { key: "validation.invalid" });
    }),
  });
}

export type InspectionInput = z.output<ReturnType<typeof inspectionSchema>>;
