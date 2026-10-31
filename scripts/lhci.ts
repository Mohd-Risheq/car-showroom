// pnpm lhci (NFR-PERF-02): Lighthouse CI on the production build, mobile, with the pages, runs and
// budget in lighthouserc.json; the reports land in .lighthouseci/reports for pnpm metrics. A page
// with no paths yet is named as pending, and with no page to measure nothing runs. It starts the
// build itself and refuses a port already in use: when LHCI's own server start fails it only warns,
// then measures whatever answers there, such as an older build or next dev. Chrome is Playwright's
// Chromium with a throwaway profile, never this machine's own Chrome, and the flags every Chromium
// here gets, without its sandbox on Linux (scripts/checks/chromium.ts). After the runs, passed or
// failed, it prints what each page's runs measured, or why there is no report, and for a failed run
// the last lines LHCI, or the build that didn't start, printed; on GitHub Actions each is an
// annotation on the run, whose page anyone can read, while its log is closed to readers without
// admin rights.
//
// Usage: pnpm lhci [lhci autorun options], after pnpm build; --collect.url=<url> adds a page
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { chromium } from "@playwright/test";
import { lighthouseChromeFlags } from "./checks/chromium.ts";
import { readJson, ROOT } from "./checks/files.ts";
import { workflowCommand } from "./checks/github.ts";
import { lastLines, lighthousePlan, lighthouseResults } from "./checks/lighthouse.ts";
import { exitStatus } from "./checks/processes.ts";

const PORT = 3000;
// How long the build may take to answer, and how often to ask it
const START_TIMEOUT_MS = 60_000;
const POLL_MS = 500;
const NEXT = createRequire(import.meta.url).resolve("next/dist/bin/next");
// Where the filesystem upload (lighthouserc.json's upload.outputDir) lists each run's report
const MANIFEST = path.join(ROOT, ".lighthouseci", "reports", "manifest.json");
const options = process.argv.slice(2);
// The option that adds a page to the plan's
const ADD_URL = "--collect.url=";
// How many of a command's last lines a failed run shows: enough for its error and where it stopped
const FAILURE_LINES = 15;
// How much of a command's output is kept for them, the end of it
const KEPT_OUTPUT = 64 * 1024;

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

// A run that stops before the upload writes no manifest, so an older one can't pass for its results
rmSync(MANIFEST, { force: true });

// The local storage adapter, as in every test run (SRS §16.1), so no run touches the real store
const server = spawn(process.execPath, [NEXT, "start", "-H", "127.0.0.1", "-p", String(PORT)], {
  cwd: ROOT,
  env: { ...process.env, STORAGE_DRIVER: "local" },
  stdio: ["ignore", "ignore", "pipe"],
});
const serverErrors = shown(server);
// Whether the server has stopped: it exited, a signal stopped it, or it never started
let stopped = false;
void exitStatus(server, "lhci: next start").then(() => {
  stopped = true;
});

/**
 * Shows what a command prints as it prints it, and keeps the end of it, to say why a run stopped.
 * The text is read once the command has closed, when its output has all arrived.
 */
function shown(child: ChildProcess): { text: () => string } {
  let kept = "";
  const keep = (to: NodeJS.WriteStream) => (chunk: Buffer) => {
    to.write(chunk);
    kept = (kept + chunk.toString()).slice(-KEPT_OUTPUT);
  };
  child.stdout?.on("data", keep(process.stdout));
  child.stderr?.on("data", keep(process.stderr));
  return { text: () => kept };
}

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

/**
 * A run's exit status and, for a failed run, why it stopped: LHCI collects, asserts the budget,
 * then writes the reports
 */
async function measure(): Promise<{ status: number; failure?: string }> {
  if (!(await serving())) {
    console.error("lhci: the production build didn't start (its message is above)");
    return {
      status: 1,
      failure: `the production build didn't start:\n${lastLines(serverErrors.text(), FAILURE_LINES)}`,
    };
  }
  const pages = urls.map((url) => `--collect.url=${url}`);
  const flags = `--collect.settings.chromeFlags=${lighthouseChromeFlags(process.platform).join(" ")}`;
  const lhci = spawn("pnpm", ["exec", "lhci", "autorun", "--failOnUploadFailure", flags, ...pages, ...options], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CHROME_PATH: chromium.executablePath() },
  });
  const output = shown(lhci);
  const status = await exitStatus(lhci, "lhci: LHCI");
  if (status === 0) return { status };
  return { status, failure: `LHCI stopped with status ${status}:\n${lastLines(output.text(), FAILURE_LINES)}` };
}

/**
 * Prints what each page's runs measured, or why there is no report, then why a failed run stopped,
 * each as an annotation on Actions
 */
function report(failure: string | undefined): void {
  const added = options.filter((option) => option.startsWith(ADD_URL)).map((option) => option.slice(ADD_URL.length));
  const annotate = process.env.GITHUB_ACTIONS === "true";
  const print = (level: "notice" | "error", title: string, text: string) =>
    console.log(annotate ? workflowCommand(level, title, text) : `lhci: ${title}: ${text}`);
  for (const result of lighthouseResults([...urls, ...added], MANIFEST, readJson)) {
    const page = URL.parse(result.url)?.pathname ?? result.url;
    if ("note" in result) print("notice", `Lighthouse ${page}`, result.note);
    else print("error", `Lighthouse ${page}`, result.problem);
  }
  if (failure) print("error", "Lighthouse CI", failure);
}

try {
  const { status, failure } = await measure();
  process.exitCode = status;
  report(failure);
} finally {
  server.kill("SIGTERM");
}
