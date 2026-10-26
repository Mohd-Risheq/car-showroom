import { describe, expect, it } from "vitest";
import { PANEL_IDS } from "@/lib/db/enums";
import { inspectionSchema } from "@/lib/validation/inspection";
import { validate } from "@/lib/validation/issues";

// API-19's inspection (FR-37): the 13 panels, each once (TC-37-4), and their readings (VR-12)

const PANELS = PANEL_IDS.map((panelId) => ({ panelId, state: "original", microns: 110 }));
const MECHANICAL = {
  chassis: { state: "sound", noteAr: null, noteEn: null },
  engine: { state: "notes", noteAr: null, noteEn: "Timing belt replaced at 90,000 km" },
  gearbox: { state: "unknown", noteAr: null, noteEn: null },
};
const META = { inspectedOn: "2026-10-12", testCenterName: "Jordan Auto Inspection", reportMediaId: null };
const INSPECTION = { meta: META, mechanical: MECHANICAL, panels: PANELS };

const NOW = new Date("2026-10-24T09:00:00.000Z");

function issues(input: object, now: Date = NOW): unknown {
  const result = validate(inspectionSchema(now), input);
  return result.ok ? "ok" : result.fieldErrors;
}

describe("the inspection", () => {
  it("takes the 13 panels with their states, readings, notes and close-ups", () => {
    const panels = PANELS.map((panel, index) =>
      index === 1
        ? {
            ...panel,
            state: "repainted",
            microns: 350,
            noteEn: "Respray",
            closeupMediaId: "0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b",
          }
        : panel,
    );
    expect(validate(inspectionSchema(NOW), { ...INSPECTION, panels })).toStrictEqual({
      ok: true,
      data: { ...INSPECTION, panels },
    });
  });

  it("ENT-Inspection: takes a date no later than today in Amman, or none", () => {
    const inspectedOn = (date: string | null, now?: Date) =>
      issues({ ...INSPECTION, meta: { ...META, inspectedOn: date } }, now);
    expect(inspectedOn("2026-10-24")).toBe("ok");
    expect(inspectedOn(null)).toBe("ok");
    expect(inspectedOn("2026-10-25")).toStrictEqual({ "meta.inspectedOn": [{ key: "validation.futureDate" }] });
    // 21:00 UTC is midnight in Amman, where the 25th has begun
    expect(inspectedOn("2026-10-25", new Date("2026-10-24T21:00:00.000Z"))).toBe("ok");
  });

  it("needs exactly the 13 panel IDs, each once (TC-37-4)", () => {
    expect(issues({ ...INSPECTION, panels: PANELS.slice(1) })).toStrictEqual({
      panels: [{ key: "validation.invalid" }],
    });
    expect(issues({ ...INSPECTION, panels: [...PANELS.slice(1), PANELS[2]] })).toStrictEqual({
      panels: [{ key: "validation.invalid" }],
    });
    expect(issues({ ...INSPECTION, panels: [...PANELS, { panelId: "spoiler", state: "original" }] })).toMatchObject({
      "panels.13.panelId": [{ key: "validation.invalid" }],
    });
  });

  it("VR-12: whole microns from 0 to 2,000, or none for a plastic panel", () => {
    const withMicrons = (microns: unknown) =>
      issues({ ...INSPECTION, panels: PANELS.map((panel, index) => (index === 0 ? { ...panel, microns } : panel)) });
    expect(withMicrons(0)).toBe("ok");
    expect(withMicrons(2000)).toBe("ok");
    expect(withMicrons(null)).toBe("ok");
    expect(withMicrons(-1)).toStrictEqual({ "panels.0.microns": [{ key: "validation.microns" }] });
    expect(withMicrons(2001)).toStrictEqual({ "panels.0.microns": [{ key: "validation.microns" }] });
    expect(withMicrons(110.5)).toStrictEqual({ "panels.0.microns": [{ key: "validation.integer" }] });
  });

  it("keeps notes to 200 characters and states to their enums", () => {
    expect(
      issues({
        ...INSPECTION,
        mechanical: { ...MECHANICAL, engine: { ...MECHANICAL.engine, noteEn: "N".repeat(200) } },
      }),
    ).toBe("ok");
    expect(
      issues({
        ...INSPECTION,
        mechanical: { ...MECHANICAL, engine: { ...MECHANICAL.engine, noteEn: "N".repeat(201) } },
      }),
    ).toStrictEqual({ "mechanical.engine.noteEn": [{ key: "validation.maxChars", values: { max: 200 } }] });
    expect(
      issues({ ...INSPECTION, mechanical: { ...MECHANICAL, gearbox: { ...MECHANICAL.gearbox, state: "fine" } } }),
    ).toStrictEqual({ "mechanical.gearbox.state": [{ key: "validation.invalid" }] });
  });

  it("ENT-Inspection: keeps the test centre's name to 80 characters", () => {
    const named = (testCenterName: string) => issues({ ...INSPECTION, meta: { ...META, testCenterName } });
    expect(named("C".repeat(80))).toBe("ok");
    expect(named("C".repeat(81))).toStrictEqual({
      "meta.testCenterName": [{ key: "validation.maxChars", values: { max: 80 } }],
    });
  });
});
