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
