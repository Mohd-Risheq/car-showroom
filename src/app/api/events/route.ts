import { createEventsHandler } from "@/features/analytics/server/ingest";

// API-03: the site's own counts of what visitors do, a day at a time (FR-47)
export const POST = createEventsHandler();
