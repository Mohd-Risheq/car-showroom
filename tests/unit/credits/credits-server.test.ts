import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { creditsTablesIn } from "@/features/credits/server/credits";
import software from "@/features/credits/software.json";
import { LOCALES } from "@/lib/i18n/locales";
import project from "../../../package.json";
import manifest from "../../../public/seed/credits.json";

// The Credits page's data (src/features/credits/server/credits.ts): the files the app is built with,
// whole in each language, and a module that won't load, so a build that stops, when they disagree
// (D-048).

afterEach(() => {
  vi.doUnmock("@/features/credits/software.json");
  vi.resetModules();
});

describe("the Credits page's data", () => {
  it.each(LOCALES)("credits every file, data source and font of public/seed/credits.json in %s", (locale) => {
    const tables = creditsTablesIn(locale);
    const files = manifest.files as { kind: string }[];
    expect(tables.photos).toHaveLength(files.filter(({ kind }) => kind === "photo").length);
    expect(tables.sounds).toHaveLength(files.filter(({ kind }) => kind === "sound").length);
    expect(tables.data.map(({ name }) => name)).toStrictEqual(manifest.data.map(({ name }) => name));
    expect(tables.fonts.map(({ name }) => name)).toStrictEqual(manifest.fonts.map(({ name }) => name));
  });

  it("lists software.json's rows, each dependency at package.json's pin and each bundled work at its own", () => {
    // Tailwind CSS's pin is among the devDependencies, as every page's stylesheet holds its base styles
    const dependencies: Record<string, string> = {
      ...project.dependencies,
      tailwindcss: project.devDependencies.tailwindcss,
    };
    expect(creditsTablesIn("en").software.map(({ name, version }) => [name, version])).toStrictEqual(
      software.rows.map((row) => [
        row.name,
        "within" in row ? ("version" in row ? row.version : null) : dependencies[row.name],
      ]),
    );
  });

  it("links each licence to an https page or to a file the site serves", () => {
    const tables = creditsTablesIn("en");
    for (const { licence } of [...tables.data, ...tables.fonts, ...tables.software]) {
      expect(licence.href).toMatch(/^(https:\/\/|\/)/);
      if (licence.href?.startsWith("/")) expect(existsSync(`public${licence.href}`)).toBe(true);
    }
  });

  it("won't load, so the build stops, while software.json lacks a dependency", async () => {
    vi.resetModules();
    vi.doMock("@/features/credits/software.json", () => ({ default: { $comment: "Emptied by a test", rows: [] } }));
    await expect(import("@/features/credits/server/credits")).rejects.toThrow(
      /^The Credits page can't be built:\n.+ is a dependency without a row in software\.json/,
    );
  });
});
