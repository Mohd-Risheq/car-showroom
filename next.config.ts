import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { BOTID_PATH, blobStoreHost, publicPolicy, securityHeaders } from "./src/lib/csp/policy";
import { LOCALES } from "./src/lib/i18n/locales";

// Every path except /{locale}/dealer/** and BotID's path gets the public policy here. Dealer
// paths get theirs, with a nonce, from proxy.ts, so each response carries exactly one policy
// (SRS §12.5).
const LOCALE = LOCALES.join("|");
const PUBLIC_PATHS = `/((?!(?:${LOCALE})/dealer(?:/|$)|${BOTID_PATH.slice(1)}(?:/|$)).*)`;
const DEALER_PATHS = `/:locale(${LOCALE})/dealer/:path*`;

const nextConfig: NextConfig = {
  // Cache Components with Partial Prefetching (SRS §11.4, §11.5)
  cacheComponents: true,
  partialPrefetching: true,
  typedRoutes: true,
  experimental: {
    // Subresource Integrity on every framework script file (SRS §12.5)
    sri: { algorithm: "sha256" },
    // Turbopack's build cache sometimes kept the stylesheet from before an edit to globals.css,
    // so each build starts cold (D-039)
    turbopackFileSystemCacheForBuild: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    const policy = publicPolicy({
      store: blobStoreHost(process.env.BLOB_STORE_HOST),
      development: process.env.NODE_ENV === "development",
    });
    return [
      {
        source: PUBLIC_PATHS,
        headers: [{ key: "Content-Security-Policy", value: policy }, ...securityHeaders("public")],
      },
      { source: DEALER_PATHS, headers: securityHeaders("dealer") },
    ];
  },
};

// next-intl's request config, with the catalogs and the formatting locale (D-040)
const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

export default withNextIntl(nextConfig);
