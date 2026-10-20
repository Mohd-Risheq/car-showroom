import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { BOTID_PATH, blobStoreHost, publicPolicy, securityHeaders } from "./src/lib/csp/policy";

// Every path except /{locale}/dealer/** and BotID's path gets the public policy here. Dealer
// paths get theirs, with a nonce, from proxy.ts, so each response carries exactly one policy
// (SRS §12.5). Header sources must be literals, so the locales are spelled out.
const PUBLIC_PATHS = `/((?!(?:ar|en)/dealer(?:/|$)|${BOTID_PATH.slice(1)}(?:/|$)).*)`;
const DEALER_PATHS = "/:locale(ar|en)/dealer/:path*";

const nextConfig: NextConfig = {
  // Cache Components with Partial Prefetching (SRS §11.4, §11.5)
  cacheComponents: true,
  partialPrefetching: true,
  typedRoutes: true,
  experimental: {
    // Subresource Integrity on every framework script file (SRS §12.5)
    sri: { algorithm: "sha256" },
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

// Finds the request config at src/i18n/request.ts
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
