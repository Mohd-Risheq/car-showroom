import { notFound } from "next/navigation";

// Spike and diagnostic pages never render on a deployment (BUILD-PLAN §9.1, SRS §15.1 VERCEL_ENV)
export function isDeployment(): boolean {
  const env = process.env.VERCEL_ENV;
  return env === "preview" || env === "production";
}

export function notFoundOnDeployments(): void {
  if (isDeployment()) notFound();
}

// Next.js keeps only the first 10 MB of a request body that passes through proxy.ts, as every
// /{locale}/dev/** request does, and drops the rest without an error (proxyClientMaxBodySize,
// D-030). So a development upload goes in parts no bigger than this.
export const DEV_UPLOAD_PART_BYTES = 8 * 1024 * 1024;
