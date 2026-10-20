import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Reads .env.local the way Next.js does; variables already set (CI, Vercel, a Neon branch) win.
loadEnvConfig(process.cwd());

// Migrations run on the direct (unpooled) URL (SRS §11.4, §17.2). `generate` does not connect.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? "" },
  strict: true,
  verbose: true,
});
