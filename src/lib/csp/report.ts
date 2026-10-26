import "server-only";
import { mediaTypeOf, readCapped } from "@/lib/http/body";
import { routing } from "@/lib/i18n/routing";
import { log } from "@/lib/log/logger";
import { requestIdFrom } from "@/lib/log/request-id";
import { CSP_REPORT_PATH } from "./policy";

// API-30: CSP violation reports (SRS §8.2, §12.5). A first cut, which T-36 finishes. The limit of
// 60 a minute per IP needs ipAddress() from @vercel/functions (SEC-12), which D-043 leaves to the
// first route limited by network, and T-36 adds it with lib/rate-limit's MemoryLimiter (D-028).
// Until then, one cap per instance bounds the log volume.

export const MAX_REPORT_BYTES = 8 * 1024;
const SAMPLE_RATE = 0.1;
export const LINES_PER_MINUTE = 100;
const MINUTE_MS = 60_000;

const CONTENT_TYPES = new Set(["application/reports+json", "application/csp-report"]);

// Browsers report a URL that isn't http(s) by its scheme alone, such as "chrome-extension".
// Safari hides extension URLs behind webkit-masked-url.
const EXTENSION_SCHEMES = new Set([
  "chrome-extension",
  "moz-extension",
  "safari-extension",
  "safari-web-extension",
  "ms-browser-extension",
  "webkit-masked-url",
]);
// What browsers report in place of a URL when the blocked thing has none
const KEYWORDS = new Set(["inline", "eval", "wasm-eval", "trusted-types-policy", "trusted-types-sink", "self"]);
const NETWORK_SCHEMES = new Set(["http", "https", "ws", "wss"]);
const SCHEME = /^([a-z][a-z0-9+.-]{0,31})(?::|$)/i;
const DIRECTIVE = /^[a-z][a-z-]{0,39}$/;

const LOCALES: ReadonlySet<string> = new Set(routing.locales);
// The sections under /[locale] (SRS §9.2), plus the local dev pages
const SECTIONS = new Set([
  "cars",
  "compare",
  "garage",
  "visit",
  "how-its-built",
  "privacy",
  "credits",
  "c",
  "demo",
  "dealer",
  "dev",
]);

type Raw = { directive: unknown; blocked: unknown; source: unknown; document: unknown };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reportingApiReport(report: unknown): Raw[] {
  if (!isObject(report) || report.type !== "csp-violation" || !isObject(report.body)) return [];
  const { effectiveDirective, blockedURL, sourceFile, documentURL } = report.body;
  return [{ directive: effectiveDirective, blocked: blockedURL, source: sourceFile, document: documentURL }];
}

// The body's shape decides the format, not its content type: WebKit 27 sends one Reporting API
// report as application/csp-report (docs/evidence/T-06). Reporting API batches are arrays, and
// older browsers send {"csp-report": {...}}.
function rawReports(data: unknown): Raw[] {
  if (Array.isArray(data)) return data.flatMap(reportingApiReport);
  const legacy = isObject(data) ? data["csp-report"] : undefined;
  if (!isObject(legacy)) return reportingApiReport(data);
  const violated = legacy["violated-directive"];
  return [
    {
      directive: legacy["effective-directive"] ?? (typeof violated === "string" ? violated.split(" ")[0] : undefined),
      blocked: legacy["blocked-uri"],
      source: legacy["source-file"],
      document: legacy["document-uri"],
    },
  ];
}

function schemeOf(value: unknown): string | undefined {
  return typeof value === "string" ? SCHEME.exec(value)?.[1]?.toLowerCase() : undefined;
}

function fromExtension(raw: Raw): boolean {
  return [raw.blocked, raw.source].some((value) => EXTENSION_SCHEMES.has(schemeOf(value) ?? ""));
}

/** The blocked resource as a keyword, a scheme or an origin, never its path or query */
export function blockedSource(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  if (KEYWORDS.has(value)) return value;
  const scheme = schemeOf(value);
  if (scheme === undefined) return "unknown";
  if (!NETWORK_SCHEMES.has(scheme)) return `${scheme}:`;
  try {
    return new URL(value).origin;
  } catch {
    return "unknown";
  }
}

/** The page as a route template, so no slug, id or query reaches the log */
export function routeTemplate(documentUrl: unknown): string {
  if (typeof documentUrl !== "string") return "unknown";
  let pathname: string;
  try {
    pathname = new URL(documentUrl).pathname;
  } catch {
    return "unknown";
  }
  const [locale, section, ...rest] = pathname.split("/").filter(Boolean);
  if (locale === undefined) return "/";
  if (!LOCALES.has(locale)) return "/…";
  if (section === undefined) return "/[locale]";
  if (!SECTIONS.has(section)) return "/[locale]/…";
  return `/[locale]/${section}${rest.length > 0 ? "/…" : ""}`;
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}

export type ReportHandlerOptions = {
  random?: () => number;
  now?: () => number;
};

/** POST /api/csp-report: always 204, stores nothing, and logs a sample at WARN (NFR-OBS-01) */
export function createReportHandler({ random = Math.random, now = Date.now }: ReportHandlerOptions = {}): (
  request: Request,
) => Promise<Response> {
  let windowStart = Number.NEGATIVE_INFINITY;
  let lines = 0;

  return async function POST(request) {
    const started = performance.now();
    if (!CONTENT_TYPES.has(mediaTypeOf(request.headers))) return noContent();
    const body = await readCapped(request.body, MAX_REPORT_BYTES);
    if (body === "too_large") return noContent();
    let data: unknown;
    try {
      data = JSON.parse(new TextDecoder().decode(body));
    } catch {
      return noContent();
    }

    const requestId = requestIdFrom(request.headers);
    for (const raw of rawReports(data)) {
      if (fromExtension(raw) || random() >= SAMPLE_RATE) continue;
      const time = now();
      if (time - windowStart >= MINUTE_MS) {
        windowStart = time;
        lines = 0;
      }
      if (lines >= LINES_PER_MINUTE) break;
      lines += 1;
      log("warn", "csp_violation", {
        requestId,
        route: CSP_REPORT_PATH,
        durationMs: Math.round(performance.now() - started),
        directive: typeof raw.directive === "string" && DIRECTIVE.test(raw.directive) ? raw.directive : "unknown",
        blocked: blockedSource(raw.blocked),
        document: routeTemplate(raw.document),
      });
    }
    return noContent();
  };
}
