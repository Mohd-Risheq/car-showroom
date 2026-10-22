// pnpm lhci (NFR-PERF-02): Lighthouse CI on the production build, mobile, with the pages, runs and
// budget in lighthouserc.json; the reports land in .lighthouseci/reports for pnpm metrics. A page
// with no paths yet is named as pending, and with no page to measure nothing runs. It starts the
// build itself and refuses a port already in use: when LHCI's own server start fails it only warns,
// then measures whatever answers there, such as an older build or next dev. Chrome is Playwright's
// Chromium with a throwaway profile, never this machine's own Chrome, and the flags every Chromium
// here gets (scripts/checks/chromium.ts).
//
// Usage: pnpm lhci [lhci autorun options], after pnpm build; --collect.url=<url> adds a page
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { chromium } from "@playwright/test";
import { CHROMIUM_FLAGS } from "./checks/chromium.ts";
import { readJson, ROOT } from "./checks/files.ts";
import { lighthousePlan } from "./checks/lighthouse.ts";
import { exitStatus } from "./checks/processes.ts";

const PORT = 3000;
// How long the build may take to answer, and how often to ask it
const START_TIMEOUT_MS = 60_000;
const POLL_MS = 500;
const NEXT = createRequire(import.meta.url).resolve("next/dist/bin/next");
const options = process.argv.slice(2);

/** Whether something already accepts connections on the port at this address */
function answers(host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: PORT });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function fail(message: string): never {
  console.error(`lhci: ${message}`);
  process.exit(1);
}

const rc = readJson(path.join(ROOT, "lighthouserc.json"));
if ("problem" in rc) fail(rc.problem);
const plan = lighthousePlan(rc.json, `http://localhost:${PORT}`);
if (typeof plan === "string") fail(plan);
const { urls, pending } = plan;
if (pending.length) console.log(`lhci: pending until built: ${pending.join(", ")}`);
if (!urls.length && !options.some((option) => option.startsWith("--collect.url"))) {
  console.log("lhci: no page to measure yet, so Lighthouse didn't run");
  process.exit(0);
}

if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) fail("there is no production build; run pnpm build first");
// localhost may reach either address, so both must be free
if ((await answers("127.0.0.1")) || (await answers("::1"))) {
  fail(`something already answers on port ${PORT}; stop it, so that LHCI measures this build`);
}

// The local storage adapter, as in every test run (SRS §16.1), so no run touches the real store
const server = spawn(process.execPath, [NEXT, "start", "-H", "127.0.0.1", "-p", String(PORT)], {
  cwd: ROOT,
  env: { ...process.env, STORAGE_DRIVER: "local" },
  stdio: ["ignore", "ignore", "inherit"],
});
// Whether the server has stopped: it exited, a signal stopped it, or it never started
let stopped = false;
void exitStatus(server, "lhci: next start").then(() => {
  stopped = true;
});

/** Whether the build answers in time, rather than the server stopping first */
async function serving(): Promise<boolean> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline && !stopped) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/en`)).ok) return true;
    } catch {
      // Not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return false;
}

/** LHCI's exit status: collect, then assert the budget, then write the reports */
async function measure(): Promise<number> {
  if (!(await serving())) {
    console.error("lhci: the production build didn't start (its message is above)");
    return 1;
  }
  const pages = urls.map((url) => `--collect.url=${url}`);
  const flags = `--collect.settings.chromeFlags=${CHROMIUM_FLAGS.join(" ")}`;
  const lhci = spawn("pnpm", ["exec", "lhci", "autorun", "--failOnUploadFailure", flags, ...pages, ...options], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, CHROME_PATH: chromium.executablePath() },
  });
  return exitStatus(lhci, "lhci: LHCI");
}

try {
  process.exitCode = await measure();
} finally {
  server.kill("SIGTERM");
}
