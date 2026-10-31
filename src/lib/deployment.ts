import "server-only";
import { notFound } from "next/navigation";

// Spike and diagnostic pages never render on a deployment (BUILD-PLAN §9.1, SRS §15.1 VERCEL_ENV)
export function isDeployment(): boolean {
  const env = process.env.VERCEL_ENV;
  return env === "preview" || env === "production";
}

export function notFoundOnDeployments(): void {
  if (isDeployment()) notFound();
}

/**
 * Whether the deployment runs as the demo (SRS §15.1 DEMO_MODE): exactly "true", as the seed reads it
 * (D-045), so a "1" or "TRUE" never turns the demo banner on while the database holds a client's cars
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}
