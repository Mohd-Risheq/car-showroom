// Which pages pnpm lhci (scripts/lhci.ts) measures: NFR-PERF-02's pages, as lighthouserc.json lists
// them. A page lists its paths once it is built and paints. Until then it is pending, because
// Lighthouse can't score a page that paints nothing (NO_FCP).
import { z } from "zod";

/** The URLs to measure, and the pages with no paths yet */
export type LighthousePlan = { urls: string[]; pending: string[] };

/** lighthouserc.json's pages, whose paths must stay on the site at origin however URLs parse them */
function pagesSchema(origin: string) {
  const site = new URL(origin).origin;
  const pagePath = z
    .string()
    .regex(/^\/(?!\/)/, "a path on this site, starting with one /")
    .refine((text) => URL.parse(text, origin)?.origin === site, "a path that stays on this site");
  return z.object({
    pages: z.array(z.object({ name: z.string().min(1), paths: z.array(pagePath) })).min(1),
  });
}

/** The plan for a build served at origin, or why lighthouserc.json can't give one */
export function lighthousePlan(rc: unknown, origin: string): LighthousePlan | string {
  const parsed = pagesSchema(origin).safeParse(rc);
  if (!parsed.success) {
    return `lighthouserc.json has no list of pages pnpm lhci can read:\n${z.prettifyError(parsed.error)}`;
  }
  const { pages } = parsed.data;
  return {
    urls: pages.flatMap((page) => page.paths.map((pagePath) => new URL(pagePath, origin).href)),
    pending: pages.filter((page) => page.paths.length === 0).map((page) => page.name),
  };
}
