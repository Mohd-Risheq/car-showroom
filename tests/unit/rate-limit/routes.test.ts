import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertLimit, type RateLimit } from "@/lib/rate-limit/limit";
import { ROUTE_LIMITS } from "@/lib/rate-limit/routes";

// The limits that actions and handlers count calls against, by their id in SRS §8.3. Each row
// matches the spec's table, read from docs/ where this repository has it.

const SRS = "docs/02-SRS.md";
const WINDOW_SECONDS = { min: 60, h: 3600 } as const;

/** §8.3's limit for an id, such as 120/min/user: 120 calls in 60 s */
function specLimit(id: string): RateLimit | undefined {
  const row = readFileSync(SRS, "utf8")
    .split("\n")
    .find((line) => line.startsWith(`| ${id} |`));
  const match = row
    ?.split("|")[6]
    ?.trim()
    .match(/^(\d+)\/(min|h)\//);
  if (!match?.[1] || !match[2]) return undefined;
  return { max: Number(match[1]), windowSeconds: WINDOW_SECONDS[match[2] as keyof typeof WINDOW_SECONDS] };
}

describe("the rate-limit routes", () => {
  it("are named by their §8.3 id, each with a limit the limiter takes", () => {
    for (const [route, limit] of Object.entries(ROUTE_LIMITS)) {
      expect(route).toMatch(/^API-\d{2}$/);
      expect(() => assertLimit(limit)).not.toThrow();
    }
  });

  it.skipIf(!existsSync(SRS))("match the table of SRS §8.3", () => {
    for (const [route, limit] of Object.entries(ROUTE_LIMITS)) expect(specLimit(route), route).toStrictEqual(limit);
  });
});
