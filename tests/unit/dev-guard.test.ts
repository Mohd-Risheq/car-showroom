import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// Spike and diagnostic pages never render on a deployment (BUILD-PLAN §9.1). The proxy answers
// 404 first (tests/unit/proxy.test.ts). Behind it, every page and layout in a (dev) group calls
// notFoundOnDeployments() before anything else, and every route handler answers 404 itself.

const DEV_GROUPS = ["src/app/[locale]/(public)/(dev)", "src/app/[locale]/dealer/(dev)"];
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

function filesNamed(name: string): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) return walk(full);
      return entry === name ? [full] : [];
    });
  return DEV_GROUPS.flatMap(walk).sort();
}

const pages = filesNamed("page.tsx");
const layouts = filesNamed("layout.tsx");
const routes = filesNamed("route.ts");

describe("dev pages and routes on deployments", () => {
  it("finds every kind of file it checks", () => {
    expect(pages.length).toBeGreaterThan(0);
    expect(layouts).toHaveLength(DEV_GROUPS.length);
    expect(routes.length).toBeGreaterThan(0);
  });

  it.each(pages)("%s calls the guard first", (file) => {
    expect(readFileSync(file, "utf8")).toMatch(
      /export default (?:async )?function \w+\(\) \{\n {2}notFoundOnDeployments\(\);\n/,
    );
  });

  it.each(layouts)("%s calls the guard first", (file) => {
    expect(readFileSync(file, "utf8")).toMatch(
      /export default (?:async )?function \w+\([^)]*\)[^{]*\{\n {2}notFoundOnDeployments\(\);\n/,
    );
  });

  it.each(routes)("%s answers 404", async (file) => {
    vi.stubEnv("VERCEL_ENV", "production");
    const routeModule: Record<string, unknown> = await import(path.resolve(file));
    const handlers = METHODS.flatMap((method) => {
      const handler = routeModule[method];
      return typeof handler === "function" ? [{ method, handler }] : [];
    });
    expect(handlers.length).toBeGreaterThan(0);
    const context = { params: Promise.resolve({ locale: "en", file: "steps-8s.wav" }) };
    for (const { method, handler } of handlers) {
      const response: unknown = await handler(new Request("https://muftah.test/en/dev/x", { method }), context);
      expect(response, method).toBeInstanceOf(Response);
      expect(response instanceof Response && response.status, method).toBe(404);
    }
  });
});
