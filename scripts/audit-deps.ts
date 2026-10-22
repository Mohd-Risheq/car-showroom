// pnpm audit:deps (SEC-11, SEC-10): the supply-chain checks of SRS §16.2's first step in one
// command, which pnpm verify:full and CI run:
//   1. SEC-11's version floors in pnpm-lock.yaml (scripts/check-versions.ts's rule);
//   2. pnpm audit and 3. OSV-Scanner on the lockfile: no high, critical or unscored advisory, apart
//      from those accepted in scripts/accepted-advisories.json (scripts/checks/supply-chain.ts);
//   4. gitleaks over the whole git history: no secret in any commit.
// Every step runs and reports, even when another fails or stops on an error, and the command exits
// 1 when any fails. A scan that didn't finish fails its step. CI installs OSV-Scanner and gitleaks
// at pinned versions; locally they come from Homebrew.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { errorMessage, readJson, ROOT } from "./checks/files.ts";
import { MAX_OUTPUT_BYTES } from "./checks/processes.ts";
import {
  type Acceptance,
  type Finding,
  findingProblems,
  findingSummary,
  GITLEAKS_LEAK_EXIT,
  gitleaksOutcome,
  osvFindings,
  parseAccepted,
  pnpmAuditFindings,
  type ScanRun,
  scanFindings,
  staleAcceptances,
} from "./checks/supply-chain.ts";
import { floorReport, lockfilePackages } from "./checks/versions.ts";

const ACCEPTED = "scripts/accepted-advisories.json";
const TODAY = new Date().toISOString().slice(0, 10);

const SCANNERS = [
  { source: "pnpm audit", command: "pnpm", args: ["audit", "--json"], read: pnpmAuditFindings },
  {
    source: "OSV-Scanner",
    command: "osv-scanner",
    args: ["scan", "source", "--lockfile", "pnpm-lock.yaml", "--format", "json"],
    read: osvFindings,
  },
] as const;

type Step = { name: string; problems: string[]; summary: string };

/** A command's run, or the problem that kept it from running */
function run(command: string, args: readonly string[]): ScanRun | string {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", maxBuffer: MAX_OUTPUT_BYTES });
  if (result.error === undefined) return result;
  return "code" in result.error && result.error.code === "ENOENT"
    ? `${command} is not installed (CI installs it at a pinned version)`
    : `${command} didn't run: ${result.error.message}`;
}

function versionFloor(): Step {
  const name = "SEC-11 version floor";
  const packages = lockfilePackages(readFileSync(path.join(ROOT, "pnpm-lock.yaml"), "utf8"));
  if (typeof packages === "string") return { name, problems: [`pnpm-lock.yaml: ${packages}`], summary: "" };
  const { installed, problems } = floorReport(packages);
  return { name, problems: problems.map((problem) => `pnpm-lock.yaml: ${problem}`), summary: installed.join(", ") };
}

function advisories(accepted: Acceptance[]): Step[] {
  const sources = SCANNERS.map(({ source, command, args, read }) => {
    const result = run(command, args);
    const findings: Finding[] | string = typeof result === "string" ? result : scanFindings(source, result, read);
    return { name: source, findings };
  });
  const steps: Step[] = sources.map(({ name, findings }) =>
    typeof findings === "string"
      ? { name, problems: [findings], summary: "" }
      : { name, problems: findingProblems(findings, accepted, TODAY), summary: findingSummary(findings) },
  );
  // An acceptance is stale only when both sources reported and neither matches it
  const reported = sources.flatMap(({ findings }) => (typeof findings === "string" ? [] : [findings]));
  if (reported.length === sources.length) {
    steps.push({
      name: "accepted advisories",
      problems: staleAcceptances(reported.flat(), accepted, ACCEPTED),
      summary: `${accepted.length} in use`,
    });
  }
  return steps;
}

function advisorySteps(): Step[] {
  const read = readJson(path.join(ROOT, ACCEPTED));
  const accepted = "problem" in read ? read.problem : parseAccepted(read.json, ACCEPTED);
  return typeof accepted === "string"
    ? [{ name: "advisories", problems: [accepted], summary: "" }]
    : advisories(accepted);
}

function secrets(): Step {
  const folder = mkdtempSync(path.join(tmpdir(), "audit-deps-"));
  const report = path.join(folder, "gitleaks.json");
  try {
    const result = run("gitleaks", [
      ...["git", "--no-banner", "--redact", "--exit-code", String(GITLEAKS_LEAK_EXIT)],
      ...["--report-format", "json", "--report-path", report],
    ]);
    const problems = typeof result === "string" ? [result] : gitleaksOutcome(result, readJson(report));
    return { name: "gitleaks", problems, summary: "no secrets in the git history" };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/** A step's result, or the error it stopped on as its problem, so every other step still reports */
function guarded(name: string, step: () => Step[]): Step[] {
  try {
    return step();
  } catch (error) {
    return [{ name, problems: [`${name} stopped: ${errorMessage(error)}`], summary: "" }];
  }
}

const results = [
  ...guarded("SEC-11 version floor", () => [versionFloor()]),
  ...guarded("advisories", advisorySteps),
  ...guarded("gitleaks", () => [secrets()]),
];
const failed = results.filter(({ name, problems, summary }) => {
  for (const problem of problems) console.error(problem);
  if (problems.length === 0) console.log(`audit:deps: ${name}: ${summary}`);
  return problems.length > 0;
});
if (failed.length > 0) {
  console.error(`audit:deps: ${failed.map(({ name }) => name).join(", ")} failed`);
  process.exitCode = 1;
}
