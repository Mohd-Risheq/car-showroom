import "server-only";
import { sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { eventDaily } from "@/lib/db/schema";
import type { AppLocale } from "@/lib/i18n/locales";
import type { EventName } from "./events";

// ENT-EventDaily's counts (FR-47.2): a row a day for an event, a car and a locale, and its count,
// nothing else. An event adds one to its row in a single upsert, which makes the row on the day's
// first event, so events counted at the same moment each count.

export type EventCount = {
  /** The date in Amman (BR-03), as Postgres's date type writes it */
  readonly day: string;
  readonly event: EventName;
  /** The car's id, or NO_CAR for an event about no car */
  readonly carId: string;
  readonly locale: AppLocale;
};

export async function countEvent(db: Database, { day, event, carId, locale }: EventCount): Promise<void> {
  await db
    .insert(eventDaily)
    .values({ day, event, carId, locale, count: 1 })
    .onConflictDoUpdate({
      target: [eventDaily.day, eventDaily.event, eventDaily.carId, eventDaily.locale],
      set: { count: sql`${eventDaily.count} + 1` },
    });
}
