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

// Each config that sets no-restricted-imports lists the restrictions again, so each is tried
const CONFIGS = [
  FEATURE,
  "src/app/_dev/specimen/demo.tsx",
  "src/lib/motion/gsap.ts",
  "src/lib/i18n/server.ts",
  "src/lib/i18n/request.ts",
];

describe("Motion's and Phosphor's imports", () => {
  it("refuse the full motion component and the framer-motion name, and take m", async () => {
    for (const filePath of CONFIGS) {
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
    // Its other entries, /dist/ssr among them, so every icon comes from /ssr
    const ENTRIES = [
      "@phosphor-icons/react",
      "@phosphor-icons/react/dist/ssr",
      "@phosphor-icons/react/dist/ssr/Car",
      "@phosphor-icons/react/dist/csr/Car",
      "@phosphor-icons/react/Car",
      "@phosphor-icons/react/ssr/Car",
    ];
    for (const filePath of CONFIGS) {
      for (const entry of ENTRIES) {
        expect(
          await broken(filePath, `import { CarIcon } from "${entry}";\nexport const icon = CarIcon;\n`),
          `${filePath}: ${entry}`,
        ).toStrictEqual(["no-restricted-imports"]);
      }
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
  const FILES = CONFIGS.filter((filePath) => filePath !== "src/lib/i18n/server.ts");
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

  it("is checked with isAppLocale, as next-intl's hasLocale brings its message formatter into the browser (D-041)", async () => {
    const check = 'import { hasLocale } from "next-intl";\nexport const check = hasLocale;\n';
    for (const filePath of CONFIGS.filter((filePath) => filePath !== "src/lib/i18n/request.ts")) {
      expect(await broken(filePath, check), filePath).toStrictEqual(["no-restricted-imports"]);
    }
    // The request config runs on the server alone, and SRS §11.5 rule 8 has it check with hasLocale
    expect(await broken("src/lib/i18n/request.ts", check)).toStrictEqual([]);
  });

  it("still translates: translations come from next-intl anywhere", async () => {
    for (const filePath of FILES) {
      for (const code of [
        'import { getTranslations } from "next-intl/server";\nexport const t = getTranslations;\n',
        'import { useTranslations } from "next-intl";\nexport const hook = useTranslations;\n',
      ]) {
        expect(await broken(filePath, code), `${filePath}: ${code}`).toStrictEqual([]);
      }
    }
  });
});

describe("numbers and dates", () => {
  // Written by src/lib/format alone (BR-02, BR-03, D-041). Each config that sets no-restricted-syntax
  // lists the formatters, so each is tried; the development pages are exempt.
  const SHIPPED = [FEATURE, "src/features/spin/index.ts", "src/lib/motion/scrub.tsx", "src/lib/i18n/server.ts"];
  const FORMATTING = [
    "export const price = (value: number) => value.toLocaleString();\n",
    'export const day = (date: Date) => date.toLocaleDateString("en-GB");\n',
    "export const time = (date: Date) => date.toLocaleTimeString();\n",
    'export const format = new Intl.NumberFormat("en-GB");\n',
    'export const format = Intl.DateTimeFormat("en-GB");\n',
    ...["RelativeTimeFormat", "ListFormat", "DurationFormat", "DisplayNames"].map(
      (name) => `export const format = new Intl.${name}("en-GB");\n`,
    ),
  ];
  const FORMATTER = [
    'import { getFormatter } from "next-intl/server";\nexport const format = getFormatter;\n',
    'import { useFormatter } from "next-intl";\nexport const format = useFormatter;\n',
    'import { createFormatter } from "next-intl";\nexport const format = createFormatter;\n',
  ];

  it("are refused outside src/lib/format, from Intl, toLocaleString and next-intl's formatter alike", async () => {
    for (const filePath of SHIPPED) {
      for (const code of FORMATTING) {
        expect(await broken(filePath, code), `${filePath}: ${code}`).toStrictEqual(["no-restricted-syntax"]);
      }
    }
    for (const filePath of [FEATURE, "src/lib/motion/gsap.ts", "src/lib/i18n/server.ts"]) {
      for (const code of FORMATTER) {
        expect(await broken(filePath, code), `${filePath}: ${code}`).toStrictEqual(["no-restricted-imports"]);
      }
    }
  });

  it("are src/lib/format's own, the development pages may measure Intl, and Intl's other tools stay open", async () => {
    for (const filePath of ["src/lib/format/numbers.ts", "src/app/[locale]/(public)/(dev)/dev/canvas/card.ts"]) {
      for (const code of FORMATTING) expect(await broken(filePath, code), `${filePath}: ${code}`).toStrictEqual([]);
    }
    for (const code of [
      'export const words = new Intl.Segmenter("ar", { granularity: "word" });\n',
      'export const order = new Intl.Collator("ar");\n',
      'export const tag = new Intl.Locale("en-US").language;\n',
      'export const forms = new Intl.PluralRules("ar");\n',
      "export const fixed = (value: number) => value.toFixed(1);\n",
    ]) {
      expect(await broken(FEATURE, code), code).toStrictEqual([]);
    }
  });

  it("keep the other restrictions in the files exempt from the formatters", async () => {
    for (const filePath of ["src/lib/format/numbers.ts", "src/app/_dev/specimen/demo.tsx"]) {
      expect(await broken(filePath, 'export * from "./dates";\n'), filePath).toStrictEqual(["no-restricted-syntax"]);
      expect(await broken(filePath, 'export const load = () => import("gsap");\n'), filePath).toStrictEqual([
        "no-restricted-syntax",
      ]);
    }
  });
});
