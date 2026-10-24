// The rules of pnpm audit:deps (scripts/audit-deps.ts), SEC-11 and SEC-10: no high or critical
// advisory from pnpm audit or OSV-Scanner, nor one with no severity score, apart from those the owner
// accepted by exact ID in scripts/accepted-advisories.json, each only for its package, only for the
// installed version an entry names where it names one, and only until its review date. An acceptance
// that no advisory matches any more fails too, so the list never outlives its reason.
// gitleaks' findings are named by rule, file, line and commit, never by the secret. A scan that
// didn't finish is a problem too, never a clean result.
import { z } from "zod";

export type Severity = "low" | "moderate" | "high" | "critical" | "unscored";

/** One advisory against one installed version of a package, as one of the two sources reports it */
export type Finding = {
  source: "pnpm audit" | "OSV-Scanner";
  id: string;
  aliases: string[];
  name: string;
  version: string;
  severity: Severity;
  title: string;
};

const BLOCKING: Severity[] = ["high", "critical", "unscored"];

/** A scanner's exit and output, as spawnSync gives them */
export type ScanRun = { status: number | null; signal: string | null; stdout: string; stderr: string };

/** What went wrong with a run: how it ended, and the last line of its error output when it wrote one */
function ending(what: string, run: ScanRun): string {
  const detail = run.stderr.trim().split("\n").at(-1);
  return `${what} (exit ${run.status ?? run.signal})${detail ? `: ${detail}` : ""}`;
}

/**
 * A source's findings from its run. pnpm audit and OSV-Scanner exit 0 having found nothing and 1
 * having found advisories; any other exit means the scan didn't finish, so its report, however
 * clean, is refused.
 */
export function scanFindings(
  source: Finding["source"],
  run: ScanRun,
  read: (json: unknown) => Finding[] | string,
): Finding[] | string {
  if (run.status !== 0 && run.status !== 1) return ending(`${source} failed`, run);
  let json: unknown;
  try {
    json = JSON.parse(run.stdout);
  } catch {
    return ending(`${source} gave no JSON report`, run);
  }
  return read(json);
}

const pnpmAuditSchema = z.object({
  advisories: z.record(
    z.string(),
    z.object({
      github_advisory_id: z.string(),
      module_name: z.string(),
      severity: z.enum(["info", "low", "moderate", "high", "critical"]),
      title: z.string(),
      cves: z.array(z.string()).default([]),
      findings: z.array(z.object({ version: z.string() })),
    }),
  ),
});

/** pnpm audit --json's advisories, one finding per installed version, or why the report can't be read */
export function pnpmAuditFindings(json: unknown): Finding[] | string {
  const parsed = pnpmAuditSchema.safeParse(json);
  if (!parsed.success)
    return `pnpm audit's report no longer has the fields this check reads:\n${z.prettifyError(parsed.error)}`;
  return Object.values(parsed.data.advisories).flatMap((advisory) =>
    advisory.findings.map(({ version }) => ({
      source: "pnpm audit" as const,
      id: advisory.github_advisory_id,
      aliases: advisory.cves,
      name: advisory.module_name,
      version,
      severity: advisory.severity === "info" ? "low" : advisory.severity,
      title: advisory.title,
    })),
  );
}

const osvSchema = z.object({
  results: z.array(
    z.object({
      packages: z.array(
        z.object({
          package: z.object({ name: z.string(), version: z.string() }),
          groups: z.array(
            z.object({
              ids: z.array(z.string()).min(1),
              aliases: z.array(z.string()).default([]),
              max_severity: z.string().default(""),
            }),
          ),
          vulnerabilities: z.array(z.object({ id: z.string(), summary: z.string().default("") })).default([]),
        }),
      ),
    }),
  ),
});

/** CVSS's band for a score, or unscored when the advisory has none */
function severityOf(score: string): Severity {
  const value = Number.parseFloat(score);
  if (Number.isNaN(value)) return "unscored";
  if (value >= 9) return "critical";
  if (value >= 7) return "high";
  return value >= 4 ? "moderate" : "low";
}

/** OSV-Scanner's JSON, one finding per group of aliased advisories on each package version */
export function osvFindings(json: unknown): Finding[] | string {
  const parsed = osvSchema.safeParse(json);
  if (!parsed.success)
    return `OSV-Scanner's report no longer has the fields this check reads:\n${z.prettifyError(parsed.error)}`;
  return parsed.data.results.flatMap(({ packages }) =>
    packages.flatMap(({ package: { name, version }, groups, vulnerabilities }) =>
      groups.map(({ ids, aliases, max_severity: score }) => {
        const [id = "", ...others] = ids;
        return {
          source: "OSV-Scanner" as const,
          id,
          aliases: [...new Set([...others, ...aliases])].filter((alias) => alias !== id),
          name,
          version,
          severity: severityOf(score),
          title: vulnerabilities.find((vulnerability) => ids.includes(vulnerability.id))?.summary ?? "",
        };
      }),
    ),
  );
}

const acceptedSchema = z
  .object({
    $comment: z.array(z.string()).optional(),
    accepted: z.array(
      z
        .object({
          id: z.string().regex(/^GHSA(?:-[0-9a-z]{4}){3}$/, "a GitHub advisory ID, such as GHSA-vfj7-8cjw-p6xm"),
          package: z.string().min(1),
          version: z
            .string()
            .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "an exact installed version, such as 3.25.76")
            .optional(),
          reviewBy: z.iso.date("a date such as 2027-01-21"),
          decision: z.string().regex(/^D-\d{3}$/, "the DECISIONS.md entry, such as D-037"),
          reason: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

export type Acceptance = z.infer<typeof acceptedSchema>["accepted"][number];

/** The owner's acceptances, or why the list doesn't meet its schema */
export function parseAccepted(json: unknown, file: string): Acceptance[] | string {
  const parsed = acceptedSchema.safeParse(json);
  return parsed.success ? parsed.data.accepted : `${file} is not valid:\n${z.prettifyError(parsed.error)}`;
}

const covers = (acceptance: Acceptance, finding: Finding) =>
  acceptance.package === finding.name &&
  (acceptance.version === undefined || acceptance.version === finding.version) &&
  [finding.id, ...finding.aliases].includes(acceptance.id);

/** The high, critical and unscored findings that no acceptance covers on this date (YYYY-MM-DD) */
export function findingProblems(findings: Finding[], accepted: Acceptance[], today: string): string[] {
  return findings
    .filter(({ severity }) => BLOCKING.includes(severity))
    .flatMap((finding) => {
      const { source, id, name, version, severity, title } = finding;
      const what = `${source}: ${id} in ${name} ${version} is ${severity}${title ? ` (${title})` : ""}`;
      const acceptance = accepted.find((entry) => covers(entry, finding));
      if (acceptance === undefined) return [`${what}, and no acceptance covers it`];
      return today > acceptance.reviewBy
        ? [`${what}, and its acceptance ran out on ${acceptance.reviewBy} (${acceptance.decision})`]
        : [];
    });
}

/** The acceptances that no finding matches any more, which the list should drop */
export function staleAcceptances(findings: Finding[], accepted: Acceptance[], file: string): string[] {
  return accepted
    .filter((entry) => !findings.some((finding) => covers(entry, finding)))
    .map(
      (entry) =>
        `${file}: ${entry.id} in ${[entry.package, entry.version].filter(Boolean).join(" ")} matches no advisory any more (${entry.decision})`,
    );
}

/** How a source's findings stand once they pass: counts by severity, blocking ones accepted */
export function findingSummary(findings: Finding[]): string {
  if (findings.length === 0) return "no advisories";
  const counts = (["critical", "high", "unscored", "moderate", "low"] as const)
    .map((severity) => ({ severity, count: findings.filter((finding) => finding.severity === severity).length }))
    .filter(({ count }) => count > 0)
    .map(({ severity, count }) => `${count} ${severity}${BLOCKING.includes(severity) ? " (accepted)" : ""}`);
  return counts.join(", ");
}

const gitleaksSchema = z.array(
  z.object({
    RuleID: z.string(),
    File: z.string(),
    StartLine: z.number(),
    Commit: z.string(),
    Description: z.string(),
  }),
);

/** gitleaks' exit for leaks in audit:deps. Its default, 1, is also its exit when it fails. */
export const GITLEAKS_LEAK_EXIT = 3;

/**
 * gitleaks' run as problems: none for a clean scan, a line for each leak, or one line saying why
 * the scan can't be trusted, when it failed, wrote no report or exited for leaks it doesn't name
 */
export function gitleaksOutcome(run: ScanRun, report: { json: unknown } | { problem: string }): string[] {
  if (run.status !== 0 && run.status !== GITLEAKS_LEAK_EXIT) {
    return [ending("gitleaks failed", run)];
  }
  if ("problem" in report) return [`gitleaks wrote no report: ${report.problem}`];
  const problems = gitleaksProblems(report.json);
  if (run.status === GITLEAKS_LEAK_EXIT && problems.length === 0)
    return ["gitleaks exited for leaks its report doesn't name"];
  return problems;
}

/** gitleaks' JSON report as one line per finding, never showing the secret, or why it can't be read */
export function gitleaksProblems(json: unknown): string[] {
  const parsed = gitleaksSchema.safeParse(json);
  if (!parsed.success)
    return [`gitleaks' report no longer has the fields this check reads:\n${z.prettifyError(parsed.error)}`];
  return parsed.data.map(
    ({ RuleID, File, StartLine, Commit, Description }) =>
      `gitleaks: ${RuleID} in ${File}:${StartLine}, commit ${Commit.slice(0, 7)} (${Description})`,
  );
}
