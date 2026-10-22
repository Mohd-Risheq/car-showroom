import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type AnalyzerGroup,
  analyzerGroups,
  type Budgets,
  type EmittedImport,
  emittedImports,
  evaluate,
  importsIn,
  type LazyGroup,
  lazyFiles,
  matchesTrigger,
  moduleOf,
  pairGroups,
  parseBudgets,
  parseRouteStats,
  routeMatches,
  workersIn,
} from "../../../scripts/checks/bundle.ts";

// check:bundle's reasoning (NFR-PERF-03, D-037), fed by hand: the emitted code below is copied
// from a Next.js 16.4.2 build of this app, and the analyzer records follow `next analyze export`.

const SPIN_IMPORT =
  '71129,e=>{e.v(t=>Promise.all(["static/chunks/3av3lhn07d9hl.js"].map(t=>e.l(t))).then(()=>t(69055)))}]);';
const JOURNEY_IMPORTS =
  '5195,e=>{e.v(t=>Promise.all(["static/chunks/2aylt9bkxjutc.js"].map(t=>e.l(t))).then(()=>t(57335)))},' +
  '53830,e=>{e.v(t=>Promise.all(["static/chunks/0lr4frkacb8fs.js"].map(t=>e.l(t))).then(()=>t(63425)))}]);';
const SPIN_WORKER =
  '90684,t=>{t.v(t.r(10914).f("static/chunks/turbopack-worker-1hrsqshz0gfey.js",["static/chunks/0q0h95vgxhq05.js",' +
  '"static/chunks/turbopack-2pel10a8xufrn.js","static/chunks/turbopack-3-ry682tkyiqk.js"]))}]);';

const KB = 1024;
const spin = { path: "src/features/spin/index.ts" };
const cobe = { path: "cobe/dist/index.esm.js", packageName: "cobe" };
const globe = { path: "src/features/journey/ui/globe.ts" };

describe("importsIn and workersIn", () => {
  it("find each dynamic import's chunks and module", () => {
    expect(importsIn(SPIN_IMPORT)).toStrictEqual([{ chunks: ["static/chunks/3av3lhn07d9hl.js"], moduleId: "69055" }]);
    expect(importsIn(JOURNEY_IMPORTS)).toStrictEqual([
      { chunks: ["static/chunks/2aylt9bkxjutc.js"], moduleId: "57335" },
      { chunks: ["static/chunks/0lr4frkacb8fs.js"], moduleId: "63425" },
    ]);
  });

  it("find an import that fetches several chunks", () => {
    const code = 'e.v(t=>Promise.all(["static/chunks/a.js","static/chunks/b.js"].map(t=>e.l(t))).then(()=>t(7)))';
    expect(importsIn(code)).toStrictEqual([{ chunks: ["static/chunks/a.js", "static/chunks/b.js"], moduleId: "7" }]);
  });

  it("find a worker's bootstrap and chunks, and no import in it", () => {
    expect(workersIn(SPIN_WORKER)).toStrictEqual([
      [
        "static/chunks/turbopack-worker-1hrsqshz0gfey.js",
        "static/chunks/0q0h95vgxhq05.js",
        "static/chunks/turbopack-2pel10a8xufrn.js",
        "static/chunks/turbopack-3-ry682tkyiqk.js",
      ],
    ]);
    expect(importsIn(SPIN_WORKER)).toStrictEqual([]);
    expect(workersIn(SPIN_IMPORT)).toStrictEqual([]);
  });
});

describe("moduleOf and matchesTrigger", () => {
  it.each([
    ["[project]/src/features/spin/index.ts [app-client] (ecmascript)", spin],
    ["[project]/node_modules/.pnpm/cobe@2.0.1/node_modules/cobe/dist/index.esm.js [app-client] (ecmascript)", cobe],
    [
      "[project]/node_modules/.pnpm/@vercel+blob@2.8.2/node_modules/@vercel/blob/dist/client.js [app-client] (ecmascript)",
      { path: "@vercel/blob/dist/client.js", packageName: "@vercel/blob" },
    ],
  ])("reads %s", (ident, expected) => {
    expect(moduleOf(ident)).toStrictEqual(expected);
  });

  it("names a module by its path or its package only", () => {
    expect(matchesTrigger("src/features/spin/index.ts", spin)).toBe(true);
    expect(matchesTrigger("cobe", cobe)).toBe(true);
    expect(matchesTrigger("src/features/spin", spin)).toBe(false);
    expect(matchesTrigger("cobe/dist/index.esm.js", { path: "src/cobe/dist/index.esm.js" })).toBe(false);
  });
});

describe("analyzerGroups", () => {
  const line = (record: object) => JSON.stringify(record);
  const client = (path: string) => `[project]/${path} [app-client] (ecmascript)`;
  const part = (route: string, filename: string, size: number) => line({ type: "part", route, filename, size });
  const group = (route: string, kind: string, trigger: string, outputs: string[]) =>
    line({ type: "group", route, id: 0, kind, trigger_module_ident: trigger, trigger_join: "joined", outputs });

  it("keeps the async groups of page code, with the bytes of their scripts", () => {
    const jsonl = [
      line({ type: "meta", schema_version: 1 }),
      "a line that isn't JSON",
      part("/[locale]/dev/spin", "[output]/x.js", 13000),
      part("/[locale]/dev/spin", "[output]/x.js", 841),
      part("/[locale]/dev/spin", "[output]/x.css", 500),
      group("/[locale]/dev/spin", "async", client("src/features/spin/index.ts"), ["[output]/x.js", "[output]/x.css"]),
      group("/[locale]/dev/spin", "async", "[project]/src/features/spin/index.ts [app-ssr] (ecmascript)", []),
      group("/[locale]/dev/spin", "bootstrap", client("src/app/page.tsx"), ["[output]/x.js"]),
    ].join("\n");
    expect(analyzerGroups(jsonl)).toStrictEqual(new Map([["/[locale]/dev/spin", [{ module: spin, rawBytes: 13841 }]]]));
  });

  it("stops when a group's file has no bytes", () => {
    const jsonl = group("/[locale]", "async", client("src/a.ts"), ["[output]/gone.js"]);
    expect(() => analyzerGroups(jsonl)).toThrow("the analyzer lists no bytes for [output]/gone.js on /[locale]");
  });
});

describe("emittedImports", () => {
  const load = (chunks: string[], moduleId: number) =>
    `e.v(t=>Promise.all([${chunks.map((chunk) => `"static/chunks/${chunk}"`).join(",")}].map(t=>e.l(t))).then(()=>t(${moduleId})))`;
  const code: Record<string, string> = {
    "static/chunks/first.js": load(["lazy.js"], 69055),
    "static/chunks/lazy.js": SPIN_WORKER + load(["nested.js", "more.js"], 5),
    "static/chunks/nested.js": load(["lazy.js"], 69055),
    "static/chunks/0q0h95vgxhq05.js": load(["in-worker.js"], 9),
  };

  it("follows the imports from the first load, each once, and not into workers", () => {
    const imports = emittedImports(
      ["static/chunks/first.js"],
      (file) => code[file] ?? "",
      (file) => (file.endsWith("more.js") ? 10 : 100),
    );
    expect(imports).toStrictEqual([
      { chunks: ["static/chunks/lazy.js"], moduleId: "69055", rawBytes: 100 },
      { chunks: ["static/chunks/nested.js", "static/chunks/more.js"], moduleId: "5", rawBytes: 110 },
    ]);
  });

  it("counts and follows only the scripts an import fetches, as the analyzer counts only scripts", () => {
    const read: string[] = [];
    const imports = emittedImports(
      ["static/chunks/page.js"],
      (file) => {
        read.push(file);
        return file === "static/chunks/page.js" ? load(["styled.js", "styled.css"], 11) : "";
      },
      (file) => (file.endsWith(".css") ? 5000 : 100),
    );
    expect(imports).toStrictEqual([{ chunks: ["static/chunks/styled.js"], moduleId: "11", rawBytes: 100 }]);
    expect(read).toStrictEqual(["static/chunks/page.js", "static/chunks/styled.js"]);
  });
});

describe("pairGroups", () => {
  const imported = (name: string, rawBytes: number): EmittedImport => ({
    chunks: [`static/chunks/${name}.js`],
    moduleId: "1",
    rawBytes,
  });
  const analyzed = (module: AnalyzerGroup["module"], rawBytes: number): AnalyzerGroup => ({ module, rawBytes });

  it("pairs each group with the import whose chunks have about its bytes, in any order", () => {
    // The journey's real sizes: 43 bytes more in the analyzer
    const { pairs, problems } = pairGroups(
      "/[locale]/dev/journey",
      [analyzed(globe, 21663), analyzed(cobe, 13011)],
      [imported("cobe", 12968), imported("globe", 21620)],
    );
    expect(problems).toStrictEqual([]);
    expect(pairs).toStrictEqual([
      { module: globe, chunks: ["static/chunks/globe.js"] },
      { module: cobe, chunks: ["static/chunks/cobe.js"] },
    ]);
  });

  it("takes a difference of up to the tolerance, and no more", () => {
    expect(pairGroups("/[locale]", [analyzed(spin, 1128)], [imported("a", 1000)]).pairs).toHaveLength(1);
    expect(pairGroups("/[locale]", [analyzed(spin, 1129)], [imported("a", 1000)]).pairs).toHaveLength(0);
  });

  it("stops when the counts differ", () => {
    expect(pairGroups("/[locale]", [analyzed(spin, 100)], []).problems).toStrictEqual([
      "/[locale]: the bundle analyzer has 1 lazy chunk groups and the build 0 dynamic imports",
    ]);
  });

  it("stops when no import is near a group", () => {
    expect(pairGroups("/[locale]", [analyzed(spin, 13841)], [imported("x", 13600)]).problems).toStrictEqual([
      "/[locale]: no dynamic import in the build is within 128 bytes of the lazy chunks of src/features/spin/index.ts (13841 bytes in the analyzer)",
    ]);
  });

  it("stops when sizes can't tell imports apart", () => {
    const close = pairGroups(
      "/[locale]",
      [analyzed(spin, 5000), analyzed(cobe, 9000)],
      [imported("a", 4990), imported("b", 5010)],
    );
    expect(close.pairs).toStrictEqual([]);
    expect(close.problems).toStrictEqual([
      "/[locale]: the lazy chunks of src/features/spin/index.ts (5000 bytes in the analyzer) can't be told apart by size: static/chunks/a.js, static/chunks/b.js",
      "/[locale]: no dynamic import in the build is within 128 bytes of the lazy chunks of cobe/dist/index.esm.js (9000 bytes in the analyzer)",
    ]);
  });

  it("stops when two groups claim the same import", () => {
    const shared = pairGroups(
      "/[locale]",
      [analyzed(spin, 5000), analyzed(cobe, 5050)],
      [imported("a", 5020), imported("b", 9000)],
    );
    expect(shared.pairs).toStrictEqual([]);
    expect(shared.problems).toStrictEqual([
      "/[locale]: the lazy chunks of src/features/spin/index.ts (5000 bytes in the analyzer) match the same dynamic import as another group: static/chunks/a.js",
      "/[locale]: the lazy chunks of cobe/dist/index.esm.js (5050 bytes in the analyzer) match the same dynamic import as another group: static/chunks/a.js",
    ]);
  });
});

describe("lazyFiles", () => {
  it("adds the workers the chunks start, and leaves out what the first load fetched", () => {
    const code: Record<string, string> = { "static/chunks/3av3lhn07d9hl.js": SPIN_WORKER };
    expect(
      lazyFiles(
        ["static/chunks/3av3lhn07d9hl.js"],
        ["static/chunks/page.js", "static/chunks/turbopack-3-ry682tkyiqk.js"],
        (file) => code[file] ?? "",
      ),
    ).toStrictEqual([
      "static/chunks/3av3lhn07d9hl.js",
      "static/chunks/turbopack-worker-1hrsqshz0gfey.js",
      "static/chunks/0q0h95vgxhq05.js",
      "static/chunks/turbopack-2pel10a8xufrn.js",
    ]);
  });
});

describe("routeMatches", () => {
  it.each([
    ["/[locale]/dealer", "/[locale]/dealer", true],
    ["/[locale]/dealer", "/[locale]/dealer/staff", false],
    ["/[locale]/dealer/**", "/[locale]/dealer", true],
    ["/[locale]/dealer/**", "/[locale]/dealer/cars/[id]/share", true],
    ["/[locale]/dealer/**", "/[locale]/dealership", false],
    ["/**", "/_not-found", true],
  ])("%s against %s: %s", (pattern, route, expected) => {
    expect(routeMatches(pattern, route)).toBe(expected);
  });
});

describe("evaluate", () => {
  const budgets: Budgets = {
    firstLoad: [
      { routes: "/[locale]/dev/**", skip: "dev spikes" },
      { routes: "/[locale]/dealer", name: "Dealer dashboard", maxKB: 170 },
      { routes: "/[locale]/dealer/**", name: "Dealer route", maxKB: 260 },
      { routes: "/**", name: "Public route", maxKB: 170 },
    ],
    lazy: [
      { name: "GSAP", maxKB: 55, shared: true, triggers: ["gsap"] },
      { name: "Spin", maxKB: 20, shared: false, triggers: ["src/features/spin/index.ts"] },
      { name: "Journey", maxKB: 60, shared: false, triggers: ["src/features/journey/ui/globe.ts", "cobe"] },
      { name: "Hear It", maxKB: 15, shared: false, triggers: [] },
    ],
  };
  const sizes: Record<string, number> = {
    "home.js": 150 * KB,
    "shell.js": 21 * KB,
    "dash.js": 160 * KB,
    "staff.js": 250 * KB,
    "spin.js": 6 * KB,
    "spin-worker.js": 1 * KB,
    "gsap.js": 50 * KB,
    "globe.js": 9 * KB,
    "cobe.js": 6 * KB,
    "barcode.js": 14 * KB,
  };
  const gzipBytes = (file: string) => sizes[file] ?? Number.NaN;
  const lazy = (route: string, module: LazyGroup["module"], files: string[]): LazyGroup => ({ route, module, files });
  const gsap = { path: "gsap/index.js", packageName: "gsap" };
  const routes = [
    { route: "/[locale]", chunks: ["home.js"] },
    { route: "/[locale]/cars/[slug]", chunks: ["home.js", "shell.js"] },
    { route: "/[locale]/dealer", chunks: ["dash.js"] },
    { route: "/[locale]/dealer/staff", chunks: ["staff.js"] },
    { route: "/[locale]/dev/spin", chunks: ["home.js", "shell.js", "dash.js"] },
  ];
  const groups = [
    lazy("/[locale]/cars/[slug]", spin, ["spin.js", "spin-worker.js", "gsap.js"]),
    lazy("/[locale]/cars/[slug]", gsap, ["gsap.js"]),
    lazy("/[locale]/dev/spin", spin, ["spin.js"]),
    lazy("/[locale]/cars/[slug]", globe, ["globe.js"]),
    lazy("/[locale]/cars/[slug]", cobe, ["cobe.js", "globe.js"]),
    lazy("/[locale]/dealer/staff", { path: "barcode-detector/dist/es/ponyfill.js", packageName: "barcode-detector" }, [
      "barcode.js",
    ]),
  ];

  it("holds each counted route to the first rule that matches it", () => {
    const report = evaluate({ routes, groups, budgets, gzipBytes });
    expect(report.lines.slice(0, 6)).toStrictEqual([
      "First-load JavaScript per route (gzip):",
      "  /[locale]: 150.0 KB of 170 KB (Public route)",
      "  /[locale]/cars/[slug]: 171.0 KB of 170 KB (Public route)",
      "  /[locale]/dealer: 160.0 KB of 170 KB (Dealer dashboard)",
      "  /[locale]/dealer/staff: 250.0 KB of 260 KB (Dealer route)",
      "  /[locale]/dev/spin: not counted, dev spikes",
    ]);
    expect(report.problems).toStrictEqual([
      "/[locale]/cars/[slug]: first-load JS is 171.0 KB gzipped, over the 170 KB of a Public route",
    ]);
    expect(report.measured.firstLoad.map(({ route, gzipBytes }) => [route, gzipBytes])).toStrictEqual([
      ["/[locale]", 150 * KB],
      ["/[locale]/cars/[slug]", 171 * KB],
      ["/[locale]/dealer", 160 * KB],
      ["/[locale]/dealer/staff", 250 * KB],
    ]);
  });

  it("counts a lazy budget on its heaviest route, a shared budget's files once, and each file once", () => {
    const report = evaluate({ routes: [], groups, budgets, gzipBytes });
    expect(report.lines).toStrictEqual([
      "First-load JavaScript per route (gzip):",
      "Lazy chunks, on the route where each weighs most (gzip):",
      "  GSAP: 50.0 KB of 55 KB, on /[locale]/cars/[slug]",
      "  Spin: 7.0 KB of 20 KB, on /[locale]/cars/[slug]",
      "  Journey: 15.0 KB of 60 KB, on /[locale]/cars/[slug]",
      "  Hear It: pending, no feature loads it lazily yet (15 KB)",
      "  barcode-detector/dist/es/ponyfill.js: 14.0 KB on /[locale]/dealer/staff, in no lazy budget",
    ]);
    expect(report.problems).toStrictEqual([]);
    expect(report.measured.lazy).toStrictEqual([
      { name: "GSAP", budgetBytes: 55 * KB, gzipBytes: 50 * KB, route: "/[locale]/cars/[slug]" },
      { name: "Spin", budgetBytes: 20 * KB, gzipBytes: 7 * KB, route: "/[locale]/cars/[slug]" },
      { name: "Journey", budgetBytes: 60 * KB, gzipBytes: 15 * KB, route: "/[locale]/cars/[slug]" },
      { name: "Hear It", budgetBytes: 15 * KB },
    ]);
  });

  it("fails a lazy budget that is over, and a trigger that no route loads", () => {
    const over = {
      ...budgets,
      lazy: [{ name: "Spin", maxKB: 6, shared: false, triggers: ["src/features/spin/index.ts", "src/old.ts"] }],
    };
    expect(evaluate({ routes: [], groups, budgets: over, gzipBytes }).problems).toStrictEqual([
      "Spin: no route loads src/old.ts lazily. If it moved, update its trigger in scripts/perf-budgets.json",
      "Spin: its lazy chunks are 57.0 KB gzipped on /[locale]/cars/[slug], over its 6 KB",
    ]);
  });

  it("fails a route that no rule matches", () => {
    const narrow = { ...budgets, firstLoad: [{ routes: "/[locale]", name: "Public route", maxKB: 170 }] };
    expect(evaluate({ routes: routes.slice(2, 3), groups, budgets: narrow, gzipBytes }).problems).toStrictEqual([
      "/[locale]/dealer: no firstLoad rule in scripts/perf-budgets.json matches this route",
    ]);
  });
});

describe("parseBudgets", () => {
  const committed = parseBudgets(
    JSON.parse(readFileSync(new URL("../../../scripts/perf-budgets.json", import.meta.url), "utf8")),
  );

  it("reads the committed budgets, which are NFR-PERF-03's own numbers", () => {
    const firstLoad = Object.fromEntries(
      committed.firstLoad.map((rule) => [rule.routes, "skip" in rule ? "skip" : rule.maxKB]),
    );
    expect(firstLoad).toStrictEqual({
      "/[locale]/dev/**": "skip",
      "/[locale]/dealer/dev/**": "skip",
      "/[locale]/dealer": 170,
      "/[locale]/dealer/**": 260,
      "/**": 170,
    });
    expect(Object.fromEntries(committed.lazy.map(({ name, maxKB }) => [name, maxKB]))).toStrictEqual({
      "GSAP core and ScrollTrigger": 55,
      "Body Scan": 25,
      "Hear It": 15,
      Spin: 20,
      "Journey (cobe + code)": 60,
      "Drag Race": 20,
      "Hero effect": 15,
      "Reel It": 150,
    });
    expect(committed.lazy.filter(({ shared }) => shared).map(({ name }) => name)).toStrictEqual([
      "GSAP core and ScrollTrigger",
    ]);
  });

  it.each([
    ["a rule with neither a skip nor a budget", { firstLoad: [{ routes: "/**" }], lazy: [] }],
    ["a budget of no bytes", { firstLoad: [{ routes: "/**", name: "Public", maxKB: 0 }], lazy: [] }],
    ["a misspelt field", { firstLoad: [{ routes: "/**", name: "Public", maxKb: 170 }], lazy: [] }],
    [
      "a lazy budget with no triggers list",
      { firstLoad: [{ routes: "/**", skip: "x" }], lazy: [{ name: "Spin", maxKB: 20 }] },
    ],
  ])("refuses %s", (_case, json) => {
    expect(() => parseBudgets(json)).toThrow("scripts/perf-budgets.json is not valid");
  });
});

describe("parseRouteStats", () => {
  it("gives each route's first-load chunks from the build folder", () => {
    const stats = [
      { route: "/[locale]", firstLoadUncompressedJsBytes: 1, firstLoadChunkPaths: [".next/static/chunks/a.js"] },
    ];
    expect(parseRouteStats(stats, ".next")).toStrictEqual([{ route: "/[locale]", chunks: ["static/chunks/a.js"] }]);
  });

  it("stops when the file no longer has its fields, or lists a chunk outside the build", () => {
    expect(() => parseRouteStats([{ route: "/[locale]", firstLoadChunks: [] }], ".next")).toThrow(
      "route-bundle-stats.json no longer has the fields this check reads",
    );
    expect(() => parseRouteStats([{ route: "/[locale]", firstLoadChunkPaths: ["static/a.js"] }], ".next")).toThrow(
      "route-bundle-stats.json: /[locale] lists static/a.js, outside .next/",
    );
  });
});
