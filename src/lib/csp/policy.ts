// Content Security Policy and the other security headers (SRS §12.5, SEC-15, SEC-07).
// next.config.ts imports this file by a relative path, so it imports nothing itself.

export const CSP_REPORT_PATH = "/api/csp-report";
export const REPORTING_ENDPOINTS = `csp="${CSP_REPORT_PATH}"`;

// BotID's proxied path, where withBotId sets X-Frame-Options: SAMEORIGIN, so the public rule
// leaves it alone (SEC-15). From Vercel's BotID docs; T-28 checks it against the installed botid.
export const BOTID_PATH = "/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3";

// A full host name such as abc123.public.blob.vercel-storage.com, never a wildcard
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/** BLOB_STORE_HOST, checked: unset or empty means local runs and previews, which leave it out */
export function blobStoreHost(value: string | undefined): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (!HOST.test(value)) throw new Error("BLOB_STORE_HOST must be a host name, such as abc123.public.blob.vercel-storage.com");
  return value;
}

type Directive = readonly [name: string, ...sources: string[]];

function serialize(directives: readonly Directive[]): string {
  return directives.map((directive) => directive.join(" ")).join("; ");
}

function storeSources(host: string | undefined): string[] {
  return host ? [`https://${host}`] : [];
}

// The directives both policies end with
const SHARED_DIRECTIVES: readonly Directive[] = [
  ["object-src", "'none'"],
  ["base-uri", "'none'"],
  ["form-action", "'self'"],
  ["frame-ancestors", "'none'"],
  ["upgrade-insecure-requests"],
  ["report-uri", CSP_REPORT_PATH],
  ["report-to", "csp"],
];

export type PolicyOptions = {
  /** BLOB_STORE_HOST, already checked by blobStoreHost() */
  store?: string | undefined;
  /** React's development build needs 'unsafe-eval'. Production never has it. */
  development?: boolean;
};

/** Cached public pages: no nonce, because a nonce would make every page dynamic (SRS §12.5) */
export function publicPolicy({ store: host, development = false }: PolicyOptions = {}): string {
  return serialize([
    ["default-src", "'self'"],
    ["script-src", "'self'", "'unsafe-inline'", ...(development ? ["'unsafe-eval'"] : [])],
    ["script-src-attr", "'none'"],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "blob:", "data:", ...storeSources(host)],
    ["media-src", "'self'", ...storeSources(host)],
    ["connect-src", "'self'", ...storeSources(host)],
    ["font-src", "'self'"],
    ...SHARED_DIRECTIVES,
  ]);
}

/** The dealer workspace and auth pages: a strict policy with a fresh nonce per request */
export function dealerPolicy(nonce: string, { store: host, development = false }: PolicyOptions = {}): string {
  // Next.js reads the nonce from the first directive that starts with "script-src", so this one
  // stays ahead of any script-src-elem or script-src-attr
  return serialize([
    ["default-src", "'self'"],
    ["script-src", "'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'wasm-unsafe-eval'", ...(development ? ["'unsafe-eval'"] : [])],
    // Sonner adds its stylesheet as a <style> with no nonce, so styles fall back to 'unsafe-inline'
    // (SRS §12.5, DECISIONS.md D-028). No nonce here: browsers ignore 'unsafe-inline' next to one.
    ["style-src", "'self'", "'unsafe-inline'"],
    ["style-src-attr", "'unsafe-inline'"],
    ["img-src", "'self'", "blob:", "data:", ...storeSources(host)],
    ["media-src", "'self'", "blob:", ...storeSources(host)],
    ["connect-src", "'self'", "https://vercel.com/api/blob/", ...storeSources(host)],
    ["worker-src", "'self'", "blob:"],
    ["font-src", "'self'"],
    ...SHARED_DIRECTIVES,
  ]);
}

/** 128 random bits, in standard base64 */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export type Header = { key: string; value: string };

const PERMISSIONS = {
  public: "camera=(), microphone=(), geolocation=(), accelerometer=(), gyroscope=(), magnetometer=(), payment=(), usb=()",
  dealer: "camera=(self), microphone=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self)",
} as const;

/** SEC-15 headers for one side. The dealer CSP itself comes from proxy.ts, per request. */
export function securityHeaders(side: "public" | "dealer"): Header[] {
  return [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: PERMISSIONS[side] },
    { key: "Reporting-Endpoints", value: REPORTING_ENDPOINTS },
  ];
}
