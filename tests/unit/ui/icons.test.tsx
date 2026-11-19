import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import * as phosphor from "@phosphor-icons/react/ssr";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { ArrowClockwiseIcon } from "@/components/ui/icons/arrow-clockwise";

// DESIGN §3.6 draws Phosphor's icons at one weight, regular. Code that runs in the browser takes them
// from src/components/ui/icons/, which holds that weight alone, one module each, as each of
// Phosphor's own icons brings all six to the page (D-049).

const SRC = path.resolve(import.meta.dirname, "../../../src");

/** The one module of the browser's code that builds on Phosphor, the folder's, on its SSRBase */
const REGULAR_ICON = path.join(SRC, "components/ui/icons/regular-icon.tsx");

/** Phosphor's package, by any of its entries */
const PHOSPHOR = /^@phosphor-icons\/react(?:\/|$)/;

type Icon = ComponentType<Record<string, unknown>>;

/** Whether a module's export is a component, as each of the folder's icons is */
const isIcon = (value: unknown): value is Icon => typeof value === "function";

/** Whether a name is one of Phosphor's icons, which its ssr entry exports beside SSRBase */
const isPhosphorIcon = (name: string): name is Exclude<keyof typeof phosphor, "SSRBase"> =>
  name !== "SSRBase" && name in phosphor;

/** Every export of the folder's modules, by its module */
const ICONS = Object.entries(
  import.meta.glob<Record<string, unknown>>("../../../src/components/ui/icons/*.ts", { eager: true }),
).flatMap(([module, exports]) => Object.entries(exports).map(([name, icon]) => ({ module, name, icon })));

describe("the regular icons", () => {
  it("each render as Phosphor's own icon of its name at the regular weight", () => {
    expect(ICONS.length).toBeGreaterThan(0);
    for (const { module, name, icon: Ours } of ICONS) {
      expect(isIcon(Ours), `${module}: ${name} isn't a component`).toBe(true);
      expect(isPhosphorIcon(name), `${module}: ${name} isn't one of Phosphor's icons`).toBe(true);
      if (!isIcon(Ours) || !isPhosphorIcon(name)) continue;
      const Theirs = phosphor[name];
      const props = { className: "size-icon", "aria-hidden": true };
      expect(renderToStaticMarkup(<Ours {...props} />), name).toBe(
        renderToStaticMarkup(<Theirs {...props} weight="regular" />),
      );
    }
  });

  it("are one to a module, named for the icon, as a page then carries only those its code draws", () => {
    for (const { module, name } of ICONS) {
      const kebab = name
        .replace(/Icon$/, "")
        .replace(/(?<!^)(?=[A-Z])/g, "-")
        .toLowerCase();
      expect(path.basename(module), name).toBe(`${kebab}.ts`);
    }
    expect(new Set(ICONS.map(({ module }) => module)).size).toBe(ICONS.length);
  });

  it("keep the props Phosphor's icons take, as a mirrored arrow and a size", () => {
    const html = renderToStaticMarkup(<ArrowClockwiseIcon mirrored size={24} />);
    expect(html).toBe(renderToStaticMarkup(<phosphor.ArrowClockwiseIcon mirrored size={24} />));
  });
});

/** Every module under a folder, but the dev pages, which no deployment serves */
function modules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "(dev)" || entry.name === "_dev" ? [] : modules(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/**
 * Whether a module says "use client", and what it imports for its code, as written: a static import
 * or re-export, or an import(). A type import brings none.
 */
function readModule(file: string): { client: boolean; imports: string[] } {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest);
  const imports: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [specifier] = node.arguments;
      if (specifier !== undefined && ts.isStringLiteralLike(specifier)) imports.push(specifier.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const [first] = source.statements;
  const client =
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use client";
  return { client, imports };
}

/** The module in src a specifier names, by the @/ alias or a relative path; null for a package */
function resolve(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(from), specifier);
  else return null;
  const file = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]
    .map((ending) => base + ending)
    .find((candidate) => /\.tsx?$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile());
  return file ?? null;
}

describe("code that runs in the browser", () => {
  it("draws Phosphor's icons only through the regular icons", () => {
    // A module a client module imports runs in the browser too, whether or not it says "use client"
    // itself, and so does one it loads with import(): the walk follows the @/ alias and relative
    // paths from every client module, and each module it reaches is the browser's
    const reached = new Map<string, { from: string; imports: string[] }>();
    const pending = modules(SRC)
      .filter((file) => readModule(file).client)
      .map((file) => ({ file, from: file }));
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      if (reached.has(next.file)) continue;
      const { imports } = readModule(next.file);
      reached.set(next.file, { from: next.from, imports });
      for (const specifier of imports) {
        const file = resolve(next.file, specifier);
        if (file !== null) pending.push({ file, from: next.from });
      }
    }
    // The folder's icons reach the browser through the alias, and their base through a relative path
    expect(reached.has(REGULAR_ICON)).toBe(true);
    const offenders = [...reached]
      .filter(([file, { imports }]) => file !== REGULAR_ICON && imports.some((specifier) => PHOSPHOR.test(specifier)))
      .map(([file, { from }]) => `${path.relative(SRC, file)}, from ${path.relative(SRC, from)}`);
    expect(offenders).toStrictEqual([]);
  });
});
