import "server-only";
import { cacheLife } from "next/cache";
import { ammanDate } from "@/lib/format/calendar";

/**
 * This year in Amman (BR-03), for the footer's copyright. Cached with the public data, so a prerendered
 * page holds it and the new year arrives with the day's refresh (SRS §11.4's time-based rules).
 */
export async function currentYear(): Promise<string> {
  "use cache";
  cacheLife("catalog");
  return ammanDate(new Date()).slice(0, 4);
}
