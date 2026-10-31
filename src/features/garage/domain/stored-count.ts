// BR-36: My Garage lives in the browser's local storage under garage:v1, at most 30 cars. The header's
// Garage key shows how many are kept. T-65 builds the store; this reads only the count, the way the
// store keeps it: an array of saved cars, each named by its carId.

export const GARAGE_STORAGE_KEY = "garage:v1";

/** BR-36's limit */
export const GARAGE_MAX = 30;

/** The event the store sends in this tab when it changes; other tabs hear the storage event */
export const GARAGE_CHANGE_EVENT = "muftah:garage";

/**
 * How many cars a stored garage keeps: 0 when nothing is stored, and null when what is stored can't
 * be read as a garage, so the key shows no count (FR-02 error states)
 */
export function storedCount(stored: string | null): number | null {
  if (stored === null) return 0;
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return null;
  }
  if (!Array.isArray(value)) return null;
  const saved = value.filter(
    (entry: unknown) =>
      typeof entry === "object" && entry !== null && "carId" in entry && typeof entry.carId === "string",
  );
  return Math.min(saved.length, GARAGE_MAX);
}
