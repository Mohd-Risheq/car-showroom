// The reasoning half of pnpm check:bundle (scripts/check-bundle.ts), kept apart from the file
// system so tests can feed it: what Turbopack's emitted chunks load, which lazy chunk group of the
// bundle analyzer each dynamic import is, and how the sizes stand against
// scripts/perf-budgets.json (NFR-PERF-03). Why it pairs the two sources is D-037.
//
// Paths are relative to the build folder (.next), as the emitted code writes them:
// "static/chunks/3av3lhn07d9hl.js".
import { z } from "zod";

const KB = 1024; // D-022

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const kb = (bytes: number) => `${(bytes / KB).toFixed(1)} KB`;
// The budgets are for JavaScript, and the analyzer's bytes are its scripts', so both sides count
// only scripts, never an import's stylesheets
const isScript = (file: string) => file.endsWith(".js");

/** A module the analyzer names: its path from the project root, or from node_modules for a dependency */
export type ModuleRef = { path: string; packageName?: string };

/** One of the analyzer's lazy chunk groups on a route: the module its import() loads, and its files' bytes */
export type AnalyzerGroup = { module: ModuleRef; rawBytes: number };

/** A dynamic import in the emitted code: the scripts it fetches before it runs its module, and their bytes */
export type EmittedImport = { chunks: string[]; moduleId: string; rawBytes: number };

/** A route's first-load chunks, from next build's route-bundle-stats.json */
export type RouteChunks = { route: string; chunks: string[] };

/** A lazy chunk group, paired: the module it loads on a route, and every file it fetches beyond the first load */
export type LazyGroup = { route: string; module: ModuleRef; files: string[] };

const firstLoadRuleSchema = z.union([
  z.object({ routes: z.string(), skip: z.string() }).strict(),
  z.object({ routes: z.string(), name: z.string(), maxKB: z.number().positive() }).strict(),
]);

const budgetsSchema = z.object({
  $comment: z.array(z.string()).optional(),
  firstLoad: z.array(firstLoadRuleSchema).min(1),
  lazy: z.array(
    z
      .object({
        name: z.string(),
        maxKB: z.number().positive(),
        shared: z.boolean().default(false),
        triggers: z.array(z.string()),
      })
      .strict(),
  ),
});

export type Budgets = z.infer<typeof budgetsSchema>;

/** scripts/perf-budgets.json, or an error that names what is wrong in it */
export function parseBudgets(json: unknown): Budgets {
  const parsed = budgetsSchema.safeParse(json);
  if (!parsed.success) throw new Error(`scripts/perf-budgets.json is not valid:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

const routeStatsSchema = z.array(z.object({ route: z.string(), firstLoadChunkPaths: z.array(z.string()) }));

/**
 * Each route's first-load chunks from .next/diagnostics/route-bundle-stats.json, which Next.js
 * 16.4.2 writes without documenting it (D-037). Without the fields this check reads, it stops.
 */
export function parseRouteStats(json: unknown, distDir: string): RouteChunks[] {
  const parsed = routeStatsSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `route-bundle-stats.json no longer has the fields this check reads:\n${z.prettifyError(parsed.error)}`,
    );
  }
  const prefix = `${distDir}/`;
  return parsed.data.map(({ route, firstLoadChunkPaths }) => ({
    route,
    chunks: firstLoadChunkPaths.map((chunk) => {
      if (!chunk.startsWith(prefix)) {
        throw new Error(`route-bundle-stats.json: ${route} lists ${chunk}, outside ${prefix}`);
      }
      return chunk.slice(prefix.length);
    }),
  }));
}

const partSchema = z.object({ type: z.literal("part"), route: z.string(), filename: z.string(), size: z.number() });
const groupSchema = z.object({
  type: z.literal("group"),
  route: z.string(),
  kind: z.string(),
  trigger_module_ident: z.string(),
  outputs: z.array(z.string()),
});

/**
 * The analyzer's lazy chunk groups per route, from `next analyze export`: the async groups of page
 * code (the [app-client] layer), with the bytes of their JavaScript files
 */
export function analyzerGroups(jsonl: string): Map<string, AnalyzerGroup[]> {
  const fileBytes = new Map<string, number>();
  const groups: Array<z.infer<typeof groupSchema>> = [];
  for (const line of jsonl.split("\n")) {
    if (!line.startsWith("{")) continue;
    const record: unknown = JSON.parse(line);
    const part = partSchema.safeParse(record);
    if (part.success) {
      const key = `${part.data.route} ${part.data.filename}`;
      fileBytes.set(key, (fileBytes.get(key) ?? 0) + part.data.size);
      continue;
    }
    const group = groupSchema.safeParse(record);
    if (group.success && group.data.kind === "async" && group.data.trigger_module_ident.includes(" [app-client] ")) {
      groups.push(group.data);
    }
  }
  const byRoute = new Map<string, AnalyzerGroup[]>();
  for (const { route, trigger_module_ident, outputs } of groups) {
    let rawBytes = 0;
    for (const output of outputs.filter(isScript)) {
      const size = fileBytes.get(`${route} ${output}`);
      if (size === undefined) throw new Error(`the analyzer lists no bytes for ${output} on ${route}`);
      rawBytes += size;
    }
    byRoute.set(route, [...(byRoute.get(route) ?? []), { module: moduleOf(trigger_module_ident), rawBytes }]);
  }
  return byRoute;
}

/** The module an analyzer ident names, e.g. "[project]/src/features/spin/index.ts [app-client] (ecmascript)" */
export function moduleOf(ident: string): ModuleRef {
  const [location = ""] = ident.replace(/^\[project\]\//, "").split(" ");
  const dependency = location.lastIndexOf("node_modules/");
  if (dependency === -1) return { path: location };
  const path = location.slice(dependency + "node_modules/".length);
  const [scope = "", name = ""] = path.split("/");
  return { path, packageName: scope.startsWith("@") ? `${scope}/${name}` : scope };
}

/** Whether a budget's trigger, a path from the project root or a package name, names this module */
export function matchesTrigger(trigger: string, module: ModuleRef): boolean {
  return module.path === trigger || module.packageName === trigger;
}

// What Next.js 16.4.2 emits for import(): the chunks, then the module, e.g.
//   e.v(t=>Promise.all(["static/chunks/3av3lhn07d9hl.js"].map(t=>e.l(t))).then(()=>t(69055)))
const IMPORT =
  /Promise\.all\(\[((?:"static\/chunks\/[^"]+",?)+)\]\.map\(\w+=>\w+\.l\(\w+\)\)\)\.then\(\(\)=>\w+\((\d+)\)\)/g;
// and for new Worker(): the worker's bootstrap, then its chunks, e.g.
//   t.r(10914).f("static/chunks/turbopack-worker-1hrsqshz0gfey.js",["static/chunks/0q0h95vgxhq05.js"])
const WORKER = /\.\w+\("(static\/chunks\/[^"]+)",\[((?:"static\/chunks\/[^"]+",?)*)\]\)/g;

const quoted = (list: string) => Array.from(list.matchAll(/"([^"]+)"/g), ([, text = ""]) => text);

/** The dynamic imports in a chunk's code: the chunks each fetches and the module it then runs */
export function importsIn(code: string): Array<{ chunks: string[]; moduleId: string }> {
  return Array.from(code.matchAll(IMPORT), ([, chunks = "", moduleId = ""]) => ({ chunks: quoted(chunks), moduleId }));
}

/** The files each Web Worker that a chunk's code starts fetches: its bootstrap, then its chunks */
export function workersIn(code: string): string[][] {
  return Array.from(code.matchAll(WORKER), ([, bootstrap = "", chunks = ""]) => [bootstrap, ...quoted(chunks)]);
}

/**
 * Every dynamic import a route's page code can reach: in its first-load chunks, then in the chunks
 * each import fetches. Worker code is left out, as the analyzer leaves it out.
 */
export function emittedImports(
  firstLoad: string[],
  read: (file: string) => string,
  size: (file: string) => number,
): EmittedImport[] {
  const found = new Map<string, EmittedImport>();
  const seen = new Set<string>();
  const queue = [...firstLoad];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    if (seen.has(file)) continue;
    seen.add(file);
    for (const { chunks, moduleId } of importsIn(read(file))) {
      const scripts = chunks.filter(isScript);
      const key = `${scripts.join(" ")} ${moduleId}`;
      if (found.has(key)) continue;
      found.set(key, { chunks: scripts, moduleId, rawBytes: sum(scripts.map(size)) });
      queue.push(...scripts);
    }
  }
  return [...found.values()];
}

/**
 * How far an analyzer group's bytes may be from its import's chunks. The analyzer's own build
 * gives each file 43 more bytes and other chunk names, and some code holds chunk names (D-037).
 */
const PAIR_TOLERANCE_BYTES = 128;

/**
 * Which dynamic import each of a route's analyzer groups is, by bytes. Fails closed: the counts
 * must agree and each group must match exactly one import that matches no other group.
 */
export function pairGroups(
  route: string,
  groups: AnalyzerGroup[],
  imports: EmittedImport[],
): { pairs: Array<{ module: ModuleRef; chunks: string[] }>; problems: string[] } {
  if (groups.length !== imports.length) {
    return {
      pairs: [],
      problems: [
        `${route}: the bundle analyzer has ${groups.length} lazy chunk groups and the build ${imports.length} dynamic imports`,
      ],
    };
  }
  const near = (group: AnalyzerGroup) =>
    imports.filter((entry) => Math.abs(entry.rawBytes - group.rawBytes) <= PAIR_TOLERANCE_BYTES);
  const claims = new Map<EmittedImport, number>();
  for (const entry of groups.flatMap(near)) claims.set(entry, (claims.get(entry) ?? 0) + 1);
  const pairs: Array<{ module: ModuleRef; chunks: string[] }> = [];
  const problems: string[] = [];
  for (const group of groups) {
    const candidates = near(group);
    const [only] = candidates;
    const chunks = candidates.map((entry) => entry.chunks.join(" + ")).join(", ");
    const named = `the lazy chunks of ${group.module.path} (${group.rawBytes} bytes in the analyzer)`;
    if (candidates.length === 0) {
      problems.push(`${route}: no dynamic import in the build is within ${PAIR_TOLERANCE_BYTES} bytes of ${named}`);
    } else if (candidates.length > 1) {
      problems.push(`${route}: ${named} can't be told apart by size: ${chunks}`);
    } else if (only && claims.get(only) !== 1) {
      problems.push(`${route}: ${named} match the same dynamic import as another group: ${chunks}`);
    } else if (only) {
      pairs.push({ module: group.module, chunks: only.chunks });
    }
  }
  return { pairs, problems };
}

/** The files a paired import fetches beyond the route's first load: its chunks and the workers they start */
export function lazyFiles(chunks: string[], firstLoad: string[], read: (file: string) => string): string[] {
  const files = new Set<string>();
  const queue = [...chunks];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    if (files.has(file)) continue;
    files.add(file);
    for (const worker of workersIn(read(file))) queue.push(...worker);
  }
  const loaded = new Set(firstLoad);
  return [...files].filter((file) => !loaded.has(file));
}

/** Whether a firstLoad pattern matches a route: the route itself, or with /** the route and every route below it */
export function routeMatches(pattern: string, route: string): boolean {
  if (!pattern.endsWith("/**")) return pattern === route;
  const base = pattern.slice(0, -"/**".length);
  return route === base || route.startsWith(`${base}/`);
}

/**
 * What the check measured, as .next/diagnostics/bundle-budgets.json holds it for pnpm metrics
 * (FR-46). The check writes the file and scripts/checks/metrics.ts reads it, both by this schema.
 * A lazy budget no feature loads yet has no size or route.
 */
export const measuredSchema = z.object({
  firstLoad: z.array(z.object({ route: z.string(), gzipBytes: z.number(), budgetBytes: z.number() })),
  lazy: z.array(
    z.object({
      name: z.string(),
      budgetBytes: z.number(),
      gzipBytes: z.number().optional(),
      route: z.string().optional(),
    }),
  ),
});

export type Measured = z.infer<typeof measuredSchema>;

export type BundleReport = { lines: string[]; problems: string[]; measured: Measured };

type LazyBudget = Budgets["lazy"][number];
type Sizer = (files: Iterable<string>) => number;

/** Holds each route's first load and each lazy budget's heaviest route to scripts/perf-budgets.json */
export function evaluate(input: {
  routes: RouteChunks[];
  groups: LazyGroup[];
  budgets: Budgets;
  gzipBytes: (file: string) => number;
}): BundleReport {
  const report: BundleReport = { lines: [], problems: [], measured: { firstLoad: [], lazy: [] } };
  const total: Sizer = (files) => sum([...files].map(input.gzipBytes));
  checkFirstLoads(input.routes, input.budgets.firstLoad, total, report);
  checkLazyBudgets(input.groups, input.budgets.lazy, total, report);
  return report;
}

function checkFirstLoads(routes: RouteChunks[], rules: Budgets["firstLoad"], total: Sizer, report: BundleReport) {
  report.lines.push("First-load JavaScript per route (gzip):");
  for (const { route, chunks } of routes) {
    const rule = rules.find((candidate) => routeMatches(candidate.routes, route));
    if (!rule) {
      report.problems.push(`${route}: no firstLoad rule in scripts/perf-budgets.json matches this route`);
    } else if ("skip" in rule) {
      report.lines.push(`  ${route}: not counted, ${rule.skip}`);
    } else {
      const bytes = total(chunks);
      report.measured.firstLoad.push({ route, gzipBytes: bytes, budgetBytes: rule.maxKB * KB });
      report.lines.push(`  ${route}: ${kb(bytes)} of ${rule.maxKB} KB (${rule.name})`);
      if (bytes > rule.maxKB * KB) {
        report.problems.push(
          `${route}: first-load JS is ${kb(bytes)} gzipped, over the ${rule.maxKB} KB of a ${rule.name}`,
        );
      }
    }
  }
}

function checkLazyBudgets(groups: LazyGroup[], budgets: LazyBudget[], total: Sizer, report: BundleReport) {
  const inBudget = (budget: LazyBudget, group: LazyGroup) =>
    budget.triggers.some((trigger) => matchesTrigger(trigger, group.module));
  // A shared budget's files count in that budget only
  const shared = new Set(
    groups
      .filter((group) => budgets.some((budget) => budget.shared && inBudget(budget, group)))
      .flatMap((group) => group.files.map((file) => `${group.route} ${file}`)),
  );

  report.lines.push("Lazy chunks, on the route where each weighs most (gzip):");
  for (const budget of budgets) {
    const budgetBytes = budget.maxKB * KB;
    if (budget.triggers.length === 0) {
      report.measured.lazy.push({ name: budget.name, budgetBytes });
      report.lines.push(`  ${budget.name}: pending, no feature loads it lazily yet (${budget.maxKB} KB)`);
      continue;
    }
    for (const trigger of budget.triggers) {
      if (!groups.some((group) => matchesTrigger(trigger, group.module))) {
        report.problems.push(
          `${budget.name}: no route loads ${trigger} lazily. If it moved, update its trigger in scripts/perf-budgets.json`,
        );
      }
    }
    const counted = groups
      .filter((group) => inBudget(budget, group))
      .map((group) => ({
        route: group.route,
        files: budget.shared ? group.files : group.files.filter((file) => !shared.has(`${group.route} ${file}`)),
      }));
    const worst = heaviest(counted, total);
    if (!worst) {
      report.measured.lazy.push({ name: budget.name, budgetBytes });
      continue;
    }
    report.measured.lazy.push({ name: budget.name, budgetBytes, gzipBytes: worst.bytes, route: worst.route });
    report.lines.push(`  ${budget.name}: ${kb(worst.bytes)} of ${budget.maxKB} KB, on ${worst.route}`);
    if (worst.bytes > budgetBytes) {
      report.problems.push(
        `${budget.name}: its lazy chunks are ${kb(worst.bytes)} gzipped on ${worst.route}, over its ${budget.maxKB} KB`,
      );
    }
  }

  const unbudgeted = groups.filter((group) => !budgets.some((budget) => inBudget(budget, group)));
  for (const path of new Set(unbudgeted.map((group) => group.module.path))) {
    const worst = heaviest(
      unbudgeted.filter((group) => group.module.path === path),
      total,
    );
    if (worst) report.lines.push(`  ${path}: ${kb(worst.bytes)} on ${worst.route}, in no lazy budget`);
  }
}

/** The route whose files weigh most, each file counted once per route */
function heaviest(entries: Array<{ route: string; files: string[] }>, total: Sizer) {
  const byRoute = new Map<string, Set<string>>();
  for (const { route, files } of entries) byRoute.set(route, new Set([...(byRoute.get(route) ?? []), ...files]));
  const [worst] = [...byRoute]
    .map(([route, files]) => ({ route, bytes: total(files) }))
    .sort((a, b) => b.bytes - a.bytes);
  return worst;
}
