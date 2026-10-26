import "server-only";

// NFR-OBS-01 and SRS §13.4: server logs as one JSON object per line. A line names what happened
// in `code` (an error code, or an event such as csp_violation) and carries safe fields only: the
// request ID, the route template, a duration, counts. Never personal data, secrets, request bodies,
// user or sandbox IDs. LOG_LEVEL filters the lines (SRS §15, default info).

const LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LEVELS)[number];
/** Safe fields, beside the line's own level and code, which no field may replace */
type LogFields = Readonly<Record<string, string | number | boolean | null | undefined>> & {
  readonly level?: never;
  readonly code?: never;
};

/** Refuses fields typed with a string index, such as Record<string, string>, which could hold either */
type Named<Fields> = string extends keyof Fields ? never : unknown;

export function log<Fields extends LogFields>(level: LogLevel, code: string, fields?: Fields & Named<Fields>): void {
  if (LEVELS.indexOf(level) < LEVELS.indexOf(threshold())) return;
  // The line's own level and code come first, and win over a field that a cast gets past the types
  console[level](JSON.stringify(Object.assign({ level, code }, fields, { level, code })));
}

function threshold(): LogLevel {
  const configured = process.env.LOG_LEVEL;
  return LEVELS.find((level) => level === configured) ?? "info";
}
