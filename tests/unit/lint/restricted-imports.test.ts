import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// What eslint.config.mjs lets each file import: GSAP only in its lazy desktop chunk, and Motion's
// components only as `m` inside LazyMotion (SRS §11.8). Each case is linted as the file it names.

const eslint = new ESLint();
const RULES = new Set(["no-restricted-imports", "no-restricted-syntax"]);

/** The restriction rules a file breaks */
async function broken(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).flatMap(({ ruleId }) => (ruleId && RULES.has(ruleId) ? [ruleId] : []));
}

const FEATURE = "src/features/body-scan/ui/scan.ts";

describe("GSAP's imports", () => {
  it("are refused outside its chunk, as modules and as import()", async () => {
    for (const code of [
      'import { gsap } from "gsap";\nexport const core = gsap;\n',
      'import { ScrollTrigger } from "gsap/ScrollTrigger";\nexport const trigger = ScrollTrigger;\n',
      'import { useGSAP } from "@gsap/react";\nexport const hook = useGSAP;\n',
      'import { GsapScrub } from "@/lib/motion/gsap";\nexport const scrub = GsapScrub;\n',
      // Named with its extension, which tsconfig's allowImportingTsExtensions permits
      'import { GsapScrub } from "@/lib/motion/gsap.ts";\nexport const scrub = GsapScrub;\n',
    ]) {
      expect(await broken(FEATURE, code), code).toStrictEqual(["no-restricted-imports"]);
    }
    const loads: Array<[filePath: string, specifier: string]> = [
      [FEATURE, "gsap"],
      [FEATURE, "@gsap/react"],
      // The chunk itself, which only Scrub may load
      [FEATURE, "@/lib/motion/gsap"],
      [FEATURE, "@/lib/motion/gsap.ts"],
      ["src/lib/motion/other.ts", "./gsap"],
      ["src/lib/motion/other.ts", "./gsap.ts"],
      ["src/lib/motion/scrub.tsx", "gsap"],
      // The spin engine's entry may re-export, and still may not load GSAP
      ["src/features/spin/index.ts", "gsap"],
      ["src/features/spin/index.ts", "@/lib/motion/gsap"],
    ];
    for (const [filePath, specifier] of loads) {
      for (const source of [`"${specifier}"`, `\`${specifier}\``]) {
        expect(await broken(filePath, `export const load = () => import(${source});\n`), source).toStrictEqual([
          "no-restricted-syntax",
        ]);
      }
    }
    expect(
      await broken("src/app/_dev/specimen/demo.tsx", 'import { gsap } from "gsap";\nexport const core = gsap;\n'),
    ).toStrictEqual(["no-restricted-imports"]);
  });

  it("are the chunk's own, Scrub loads the chunk, and types may come from anywhere", async () => {
    expect(await broken("src/lib/motion/scrub.tsx", 'export const load = () => import("./gsap");\n')).toStrictEqual([]);
    expect(await broken("src/features/spin/index.ts", 'export { prepare } from "./ui/viewer";\n')).toStrictEqual([]);
    expect(
      await broken("src/lib/motion/gsap.ts", 'import { gsap } from "gsap";\nexport const core = gsap;\n'),
    ).toStrictEqual([]);
    expect(
      await broken(FEATURE, 'import type { BuildScrub } from "@/lib/motion/gsap";\nexport type Build = BuildScrub;\n'),
    ).toStrictEqual([]);
  });
});

describe("Motion's and Phosphor's imports", () => {
  // Each config that sets no-restricted-imports lists them again, so each is tried
  const FILES = [FEATURE, "src/app/_dev/specimen/demo.tsx", "src/lib/motion/gsap.ts", "src/lib/i18n/server.ts"];

  it("refuse the full motion component and the framer-motion name, and take m", async () => {
    for (const filePath of FILES) {
      for (const code of [
        'import { motion } from "motion/react";\nexport const div = motion.div;\n',
        'import { motion } from "motion/react-client";\nexport const div = motion.div;\n',
        'import { m } from "framer-motion";\nexport const div = m.div;\n',
      ]) {
        expect(await broken(filePath, code), `${filePath}: ${code}`).toStrictEqual(["no-restricted-imports"]);
      }
      expect(await broken(filePath, 'import { m } from "motion/react";\nexport const div = m.div;\n')).toStrictEqual(
        [],
      );
    }
  });

  it("take Phosphor's icons from its ssr entry only", async () => {
    for (const filePath of FILES) {
      expect(
        await broken(filePath, 'import { CarIcon } from "@phosphor-icons/react";\nexport const icon = CarIcon;\n'),
        filePath,
      ).toStrictEqual(["no-restricted-imports"]);
      expect(
        await broken(filePath, 'import { CarIcon } from "@phosphor-icons/react/ssr";\nexport const icon = CarIcon;\n'),
        filePath,
      ).toStrictEqual([]);
    }
  });
});

describe("next-intl's locale", () => {
  // The formatting locale, such as ar-JO-u-nu-latn (D-040). Every config that sets
  // no-restricted-imports but one refuses it, so each is tried.
  const FILES = [FEATURE, "src/app/_dev/specimen/demo.tsx", "src/lib/motion/gsap.ts", "src/lib/i18n/routing.ts"];
  const READS = [
    'import { getLocale } from "next-intl/server";\nexport const read = getLocale;\n',
    'import { useLocale } from "next-intl";\nexport const read = useLocale;\n',
    'import { createNavigation } from "next-intl/navigation";\nexport const links = createNavigation;\n',
  ];

  it("is read by getAppLocale alone, and next-intl's links, built with it, are refused", async () => {
    for (const filePath of FILES) {
      for (const code of READS) {
        expect(await broken(filePath, code), `${filePath}: ${code}`).toStrictEqual(["no-restricted-imports"]);
      }
    }
    expect(await broken("src/lib/i18n/server.ts", READS[0] ?? "")).toStrictEqual([]);
  });

  it("can't be reached through an import() of next-intl, which no-restricted-imports doesn't see", async () => {
    // Each config that sets no-restricted-syntax lists it again, so each is tried
    for (const filePath of [FEATURE, "src/features/spin/index.ts", "src/lib/motion/scrub.tsx"]) {
      for (const specifier of ["next-intl", "next-intl/server", "next-intl/navigation"]) {
        for (const source of [`"${specifier}"`, `\`${specifier}\``]) {
          const code = `export const load = async () => (await import(${source})).default;\n`;
          expect(await broken(filePath, code), `${filePath}: ${source}`).toStrictEqual(["no-restricted-syntax"]);
        }
      }
    }
  });

  it("still formats: translations and the formatter come from next-intl anywhere", async () => {
    for (const filePath of FILES) {
      for (const code of [
        'import { getTranslations } from "next-intl/server";\nexport const t = getTranslations;\n',
        'import { useFormatter, useTranslations } from "next-intl";\nexport const hooks = [useFormatter, useTranslations];\n',
      ]) {
        expect(await broken(filePath, code), `${filePath}: ${code}`).toStrictEqual([]);
      }
    }
  });
});
