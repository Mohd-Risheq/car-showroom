import { globSync } from "node:fs";
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
const ZOD_ENTRY = "src/lib/validation/zod.ts";
const DEFINE_ACTION = "src/lib/actions/define-action.ts";
const ACTIONS = "src/features/dealer/server/actions.ts";
// Where a cached public function lives (SRS §11.4)
const CACHED = "src/features/car-page/server/car-page.ts";
const CONFIGS = [
  FEATURE,
  "src/app/_dev/specimen/demo.tsx",
  "src/lib/motion/gsap.ts",
  "src/lib/i18n/server.ts",
  "src/lib/i18n/request.ts",
  ZOD_ENTRY,
  DEFINE_ACTION,
  ACTIONS,
];

describe("Zod's imports", () => {
  // z comes from the entry that sets Zod up to build schemas without new Function (SRS §12.5,
  // D-043), so the setting is in place before any schema is built
  const LOADS = ["zod", "zod/v4", "zod/mini", "zod/v4/core"].map(
    (entry) => `import * as zod from "${entry}";\nexport const loaded = zod;\n`,
  );

  it("are refused in src outside the entry, from Zod's other entries too", async () => {
    for (const filePath of CONFIGS.filter((filePath) => filePath !== ZOD_ENTRY)) {
      for (const code of LOADS) {
        expect(await broken(filePath, code), `${filePath}: ${code}`).toStrictEqual(["no-restricted-imports"]);
      }
    }
  });

  it("are refused as import() everywhere in src, the entry included", async () => {
    // Each config that sets no-restricted-syntax lists the selectors again, so each is tried
    const files = [...CONFIGS, "src/lib/format/calendar.ts", "src/features/spin/index.ts", "src/lib/motion/scrub.tsx"];
    for (const filePath of files) {
      for (const entry of ["zod", "zod/v4/core"]) {
        for (const source of [`"${entry}"`, `\`${entry}\``]) {
          expect(
            await broken(filePath, `export const load = () => import(${source});\n`),
            `${filePath}: ${source}`,
          ).toStrictEqual(["no-restricted-syntax"]);
        }
      }
    }
  });

  it("are the entry's own, and Zod's types come from anywhere", async () => {
    expect(
      await broken(ZOD_ENTRY, 'import { z } from "zod";\nz.config({ jitless: true });\nexport { z };\n'),
    ).toStrictEqual([]);
    for (const filePath of CONFIGS) {
      for (const code of [
        'import type { z } from "zod";\nexport type Schema = z.ZodType;\n',
        'import { z } from "@/lib/validation/zod";\nexport const name = z.string();\n',
      ]) {
        expect(await broken(filePath, code), `${filePath}: ${code}`).toStrictEqual([]);
      }
    }
  });
});

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

describe("Server Actions", () => {
  // defineAction updates the cache once an action's transaction commits (SRS §11.9), and a "use
  // server" module, which exports the actions, is named actions.ts
  const UPDATES = ["updateTag", "revalidateTag", "revalidatePath", "refresh"].map(
    (name) => `import { ${name} } from "next/cache";\nexport const update = ${name};\n`,
  );
  const ENDINGS = ["redirect", "permanentRedirect", "notFound", "forbidden", "unauthorized"].map(
    (name) => `import { ${name} } from "next/navigation";\nexport const end = ${name};\n`,
  );
  // Each config that sets no-restricted-syntax repeats the import() and inline bans, so each is tried
  const SYNTAX_FILES = [
    FEATURE,
    ACTIONS,
    "src/features/spin/index.ts",
    "src/lib/motion/scrub.tsx",
    "src/lib/format/numbers.ts",
    "src/app/_dev/specimen/demo.tsx",
  ];

  it("update the cache through defineAction alone, so neither a handler nor a helper it calls does", async () => {
    for (const filePath of CONFIGS.filter((filePath) => filePath !== DEFINE_ACTION)) {
      for (const code of UPDATES) {
        expect(await broken(filePath, code), `${filePath}: ${code}`).toStrictEqual(["no-restricted-imports"]);
      }
    }
    for (const code of UPDATES) expect(await broken(DEFINE_ACTION, code), code).toStrictEqual([]);
  });

  it("can't update the cache through next/cache's default import, which is the whole module", async () => {
    const code = 'import cache from "next/cache";\nexport const update = cache.updateTag;\n';
    for (const filePath of CONFIGS.filter((filePath) => filePath !== DEFINE_ACTION)) {
      expect(await broken(filePath, code), filePath).toStrictEqual(["no-restricted-imports"]);
    }
  });

  it("can't reach Next's functions through its internals or its entries' .js files, which hide their names", async () => {
    const INTERNALS = [
      'import { updateTag } from "next/dist/server/web/spec-extension/revalidate";\nexport const update = updateTag;\n',
      'import { updateTag } from "next/cache.js";\nexport const update = updateTag;\n',
      'import { redirect } from "next/dist/client/components/redirect";\nexport const end = redirect;\n',
      'import { redirect } from "next/navigation.js";\nexport const end = redirect;\n',
    ];
    for (const filePath of CONFIGS) {
      for (const code of INTERNALS) {
        expect(await broken(filePath, code), `${filePath}: ${code}`).toStrictEqual(["no-restricted-imports"]);
      }
    }
  });

  it("import next/cache and next/navigation statically, where lint sees the names a file takes", async () => {
    const SOURCES = ["next/cache", "next/navigation", "next/dist/client/components/redirect", "next/cache.js"];
    for (const filePath of SYNTAX_FILES) {
      for (const specifier of SOURCES) {
        for (const source of [`"${specifier}"`, `\`${specifier}\``]) {
          const code = `export const load = () => import(${source});\n`;
          expect(await broken(filePath, code), `${filePath}: ${source}`).toStrictEqual(["no-restricted-syntax"]);
        }
      }
    }
  });

  it("leave cacheTag and cacheLife open, which the cached functions set, and Next's types", async () => {
    for (const code of [
      'import { cacheLife, cacheTag } from "next/cache";\nexport const tools = [cacheLife, cacheTag];\n',
      'import type { CacheHandler } from "next/dist/server/lib/cache-handlers/types";\nexport type Handler = CacheHandler;\n',
    ]) {
      for (const filePath of [FEATURE, ACTIONS, CACHED])
        expect(await broken(filePath, code), filePath).toStrictEqual([]);
    }
  });

  it("can't redirect or end the request in an action module, which would roll the change back", async () => {
    for (const code of ENDINGS) {
      expect(await broken(ACTIONS, code), code).toStrictEqual(["no-restricted-imports"]);
      expect(await broken(FEATURE, code), code).toStrictEqual([]);
    }
  });

  it("keep every other restriction in defineAction and in the action modules", async () => {
    // The suites above try both files, as configs of their own; these are the restrictions left
    for (const filePath of [DEFINE_ACTION, ACTIONS]) {
      for (const code of [
        'import { gsap } from "gsap";\nexport const core = gsap;\n',
        'import { Specimen } from "@/app/_dev/specimen/demo";\nexport const page = Specimen;\n',
        'import { getFormatter } from "next-intl/server";\nexport const format = getFormatter;\n',
      ]) {
        expect(await broken(filePath, code), `${filePath}: ${code}`).toStrictEqual(["no-restricted-imports"]);
      }
    }
  });

  it('are exports of a "use server" module, never an inline "use server" that defineAction would never guard', async () => {
    const INLINE = [
      'export async function save() {\n  "use server";\n  return 1;\n}\n',
      'export const save = async () => {\n  "use server";\n  return 1;\n};\n',
      'export const store = {\n  async save() {\n    "use server";\n    return 1;\n  },\n};\n',
    ];
    for (const filePath of SYNTAX_FILES) {
      for (const code of INLINE) {
        expect(await broken(filePath, code), `${filePath}: ${code}`).toStrictEqual(["no-restricted-syntax"]);
      }
    }
    expect(await broken(ACTIONS, '"use server";\nexport const save = async () => 1;\n')).toStrictEqual([]);
  });
});

describe("src's modules", () => {
  it("are TypeScript's .ts and .tsx alone (C-01), so every config here sees each, as the role matrix's test does", () => {
    // The configs above match src/**/*.{ts,tsx}, as does the search for "use server" modules in
    // tests/integration/actions.test.ts, while tsconfig allows JavaScript and the bundler compiles it
    expect(globSync("src/**/*.{js,jsx,mjs,cjs,mts,cts}")).toStrictEqual([]);
  });
});
