// pnpm icons: renders src/app/apple-icon.png and src/app/favicon.ico from src/app/icon.svg, after
// the SVG changes (scripts/checks/icons.ts)
//
// Usage: pnpm icons
import { readFile, writeFile } from "node:fs/promises";
import { shown } from "./checks/files.ts";
import { ICON_FILES, renderIconFiles } from "./checks/icons.ts";

const { apple, favicon } = await renderIconFiles(await readFile(ICON_FILES.svg));
await writeFile(ICON_FILES.apple, apple);
await writeFile(ICON_FILES.favicon, favicon);
console.log(`Wrote ${shown(ICON_FILES.apple)} and ${shown(ICON_FILES.favicon)}`);
