// Helpers the spike pages share while they live. Each spike goes when the task that builds its
// feature replaces it, so production code never uses these.

/** Rounds to `digits` decimal places, for the numbers in a report */
export const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

/** An error as one line: its name and message */
export function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/**
 * Calls `onViolation` with one line for each Content Security Policy violation on the page, until
 * the returned function stops it
 */
export function watchViolations(onViolation: (line: string) => void): () => void {
  const listener = (event: SecurityPolicyViolationEvent) => {
    onViolation(`${event.effectiveDirective} blocked ${event.blockedURI || "inline"}`);
  };
  document.addEventListener("securitypolicyviolation", listener);
  return () => document.removeEventListener("securitypolicyviolation", listener);
}
