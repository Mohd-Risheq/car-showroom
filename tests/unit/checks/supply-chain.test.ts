import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type Acceptance,
  type Finding,
  findingProblems,
  findingSummary,
  GITLEAKS_LEAK_EXIT,
  gitleaksOutcome,
  gitleaksProblems,
  osvFindings,
  parseAccepted,
  pnpmAuditFindings,
  type ScanRun,
  scanFindings,
  staleAcceptances,
} from "../../../scripts/checks/supply-chain.ts";

// pnpm audit:deps' rules (SEC-11, SEC-10) on trimmed copies of the lockfile's real pnpm audit and
// OSV-Scanner reports of 21 Oct 2026, in tests/fixtures/checks/supply-chain. Dates are fixed: the
// tests never read the clock (SRS §16.1).

const FIXTURES = "tests/fixtures/checks/supply-chain";
const ACCEPTED = "scripts/accepted-advisories.json";
const NOW = "2026-10-18";

const json = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));
/** A reader's findings, or the test fails with the reader's problem */
function found(read: Finding[] | string): Finding[] {
  if (typeof read === "string") throw new Error(read);
  return read;
}
const findings = (file: "pnpm-audit.json" | "osv.json") =>
  found((file === "osv.json" ? osvFindings : pnpmAuditFindings)(json(`${FIXTURES}/${file}`)));
function accepted(): Acceptance[] {
  const list = parseAccepted(json(ACCEPTED), ACCEPTED);
  if (typeof list === "string") throw new Error(list);
  return list;
}
const finding = (fields: Partial<Finding>): Finding => ({
  source: "OSV-Scanner",
  id: "GHSA-aaaa-bbbb-cccc",
  aliases: [],
  name: "left-pad",
  version: "1.0.0",
  severity: "high",
  title: "",
  ...fields,
});

describe("reading the reports", () => {
  it("gives one finding per advisory and installed version from pnpm audit", () => {
    expect(
      findings("pnpm-audit.json").map(({ id, name, version, severity }) => `${id} ${name} ${version} ${severity}`),
    ).toStrictEqual([
      "GHSA-67mh-4wv8-2f99 esbuild 0.18.20 moderate",
      "GHSA-jmr9-qjv8-65gv extract-zip 2.0.1 high",
      "GHSA-7pqw-9j4j-h8q3 extract-zip 2.0.1 high",
      "GHSA-vfj7-8cjw-p6xm braces 3.0.3 high",
      "GHSA-hp3w-g68c-fv3c sprintf-js 1.0.3 moderate",
    ]);
  });

  it("bands OSV-Scanner's scores as CVSS does, and keeps each group's other names as aliases", () => {
    expect(
      findings("osv.json").map(({ id, name, severity, aliases }) => `${id} ${name} ${severity} ${aliases.join(",")}`),
    ).toStrictEqual([
      "GHSA-vfj7-8cjw-p6xm braces high CVE-2026-93687",
      "GHSA-67mh-4wv8-2f99 esbuild moderate ",
      "GHSA-7pqw-9j4j-h8q3 extract-zip high CVE-2026-19693",
      "GHSA-jmr9-qjv8-65gv extract-zip high CVE-2026-56876",
      "GHSA-hp3w-g68c-fv3c sprintf-js moderate CVE-2026-97058",
    ]);
    const scored = (max_severity: string) =>
      osvFindings({
        results: [
          { packages: [{ package: { name: "x", version: "1.0.0" }, groups: [{ ids: ["MAL-1"], max_severity }] }] },
        ],
      });
    expect(["9.0", "7.0", "6.9", "4.0", "3.9", ""].map((score) => found(scored(score))[0]?.severity)).toStrictEqual([
      "critical",
      "high",
      "moderate",
      "moderate",
      "low",
      "unscored",
    ]);
  });

  it("counts pnpm audit's info advisories as low", () => {
    const info = pnpmAuditFindings({
      advisories: {
        "1": {
          github_advisory_id: "GHSA-aaaa-bbbb-cccc",
          module_name: "left-pad",
          severity: "info",
          title: "Deprecated",
          findings: [{ version: "1.0.0" }],
        },
      },
    });
    expect(found(info).map(({ severity, aliases }) => ({ severity, aliases }))).toStrictEqual([
      { severity: "low", aliases: [] },
    ]);
  });

  it("says when a report no longer has the fields it reads", () => {
    expect(pnpmAuditFindings({ error: { code: "ERR_PNPM_AUDIT_BAD_RESPONSE" } })).toMatch(
      /^pnpm audit's report no longer has the fields this check reads:\n/,
    );
    expect(osvFindings({ results: [{ packages: [{ groups: [] }] }] })).toMatch(
      /^OSV-Scanner's report no longer has the fields this check reads:\n/,
    );
    // A report that has lost its results is no clean scan
    expect(osvFindings({})).toMatch(/^OSV-Scanner's report no longer has the fields this check reads:\n/);
    expect(osvFindings({ results: [] })).toStrictEqual([]);
  });
});

describe("scanFindings", () => {
  const report = JSON.stringify({ results: [] });
  const scan = (fields: Partial<ScanRun>): ScanRun => ({
    status: 0,
    signal: null,
    stdout: report,
    stderr: "",
    ...fields,
  });

  it("reads the report of a scan that found nothing, or found advisories", () => {
    expect(scanFindings("OSV-Scanner", scan({ status: 0 }), osvFindings)).toStrictEqual([]);
    const osv = readFileSync(`${FIXTURES}/osv.json`, "utf8");
    expect(found(scanFindings("OSV-Scanner", scan({ status: 1, stdout: osv }), osvFindings))).toHaveLength(5);
  });

  it("refuses the report of a scan that didn't finish, however clean it looks", () => {
    const failed = scanFindings(
      "OSV-Scanner",
      scan({ status: 129, stderr: "querying\nAPI request failed" }),
      osvFindings,
    );
    expect(failed).toBe("OSV-Scanner failed (exit 129): API request failed");
    expect(scanFindings("pnpm audit", scan({ status: null, signal: "SIGTERM" }), pnpmAuditFindings)).toBe(
      "pnpm audit failed (exit SIGTERM)",
    );
  });

  it("names a scan that printed no JSON", () => {
    expect(
      scanFindings(
        "pnpm audit",
        scan({ status: 1, stdout: "", stderr: "ERR_PNPM_AUDIT_BAD_RESPONSE" }),
        pnpmAuditFindings,
      ),
    ).toBe("pnpm audit gave no JSON report (exit 1): ERR_PNPM_AUDIT_BAD_RESPONSE");
  });
});

describe("findingProblems", () => {
  it("passes today's reports with the owner's three acceptances", () => {
    expect(findingProblems([...findings("pnpm-audit.json"), ...findings("osv.json")], accepted(), NOW)).toStrictEqual(
      [],
    );
  });

  it("fails every accepted finding once its review date has passed", () => {
    const problems = findingProblems(findings("pnpm-audit.json"), accepted(), "2027-01-22");
    expect(problems).toStrictEqual([
      "pnpm audit: GHSA-jmr9-qjv8-65gv in extract-zip 2.0.1 is high (extract-zip unvalidated symlink path traversal), and its acceptance ran out on 2027-01-21 (D-037)",
      "pnpm audit: GHSA-7pqw-9j4j-h8q3 in extract-zip 2.0.1 is high (extract-zip allows arbitrary file writes through symlink archive entries), and its acceptance ran out on 2027-01-21 (D-037)",
      "pnpm audit: GHSA-vfj7-8cjw-p6xm in braces 3.0.3 is high (braces vulnerable to stack-exhaustion denial of service through deeply nested patterns), and its acceptance ran out on 2027-01-21 (D-037)",
    ]);
    expect(findingProblems(findings("pnpm-audit.json"), accepted(), "2027-01-21")).toStrictEqual([]);
  });

  it("fails a high, critical or unscored finding no acceptance covers, and never a moderate or low one", () => {
    const list = accepted();
    expect(
      findingProblems(
        [
          finding({ severity: "critical", title: "Prototype pollution" }),
          finding({ id: "MAL-2026-1", severity: "unscored", title: "Malicious code in left-pad" }),
          finding({ id: "GHSA-vfj7-8cjw-p6xm", name: "not-braces" }),
          finding({ severity: "moderate" }),
          finding({ severity: "low" }),
        ],
        list,
        NOW,
      ),
    ).toStrictEqual([
      "OSV-Scanner: GHSA-aaaa-bbbb-cccc in left-pad 1.0.0 is critical (Prototype pollution), and no acceptance covers it",
      "OSV-Scanner: MAL-2026-1 in left-pad 1.0.0 is unscored (Malicious code in left-pad), and no acceptance covers it",
      "OSV-Scanner: GHSA-vfj7-8cjw-p6xm in not-braces 1.0.0 is high, and no acceptance covers it",
    ]);
  });

  it("matches an acceptance through a finding's aliases", () => {
    const aliased = finding({ id: "CVE-2026-93687", aliases: ["GHSA-vfj7-8cjw-p6xm"], name: "braces" });
    expect(findingProblems([aliased], accepted(), NOW)).toStrictEqual([]);
  });
});

describe("staleAcceptances", () => {
  it("names an acceptance that no finding matches any more", () => {
    const withoutExtractZip = findings("osv.json").filter(({ name }) => name !== "extract-zip");
    expect(staleAcceptances(withoutExtractZip, accepted(), ACCEPTED)).toStrictEqual([
      `${ACCEPTED}: GHSA-jmr9-qjv8-65gv in extract-zip matches no advisory any more (D-037)`,
      `${ACCEPTED}: GHSA-7pqw-9j4j-h8q3 in extract-zip matches no advisory any more (D-037)`,
    ]);
    expect(staleAcceptances(findings("osv.json"), accepted(), ACCEPTED)).toStrictEqual([]);
  });
});

describe("parseAccepted", () => {
  it("holds exactly the three advisories the owner accepted, until 2027-01-21 (D-037)", () => {
    expect(
      accepted().map(({ id, package: name, reviewBy, decision }) => `${id} ${name} ${reviewBy} ${decision}`),
    ).toStrictEqual([
      "GHSA-vfj7-8cjw-p6xm braces 2027-01-21 D-037",
      "GHSA-jmr9-qjv8-65gv extract-zip 2027-01-21 D-037",
      "GHSA-7pqw-9j4j-h8q3 extract-zip 2027-01-21 D-037",
    ]);
  });

  it("refuses an entry without an exact ID, a review date, a decision or a reason", () => {
    const problem = parseAccepted(
      { accepted: [{ id: "braces", package: "braces", reviewBy: "soon", decision: "owner", reason: "" }] },
      ACCEPTED,
    );
    expect(problem).toMatch(new RegExp(`^${ACCEPTED} is not valid:\\n`));
    for (const issue of [
      "a GitHub advisory ID, such as GHSA-vfj7-8cjw-p6xm",
      "a date such as 2027-01-21",
      "the DECISIONS.md entry, such as D-037",
    ]) {
      expect(problem).toContain(issue);
    }
  });
});

describe("findingSummary and gitleaksProblems", () => {
  it("counts a passing source's findings by severity", () => {
    expect(findingSummary(findings("osv.json"))).toBe("3 high (accepted), 2 moderate");
    expect(findingSummary([])).toBe("no advisories");
  });

  it("names each leak by rule, file, line and commit, never by its secret", () => {
    const report = [
      {
        RuleID: "generic-api-key",
        File: "src/config.ts",
        StartLine: 4,
        Commit: "0123456789abcdef0123456789abcdef01234567",
        Description: "Detected a Generic API Key",
        Secret: "REDACTED",
      },
    ];
    expect(gitleaksProblems(report)).toStrictEqual([
      "gitleaks: generic-api-key in src/config.ts:4, commit 0123456 (Detected a Generic API Key)",
    ]);
    expect(gitleaksProblems([{ RuleID: "x" }])[0]).toMatch(
      /^gitleaks' report no longer has the fields this check reads:\n/,
    );
  });
});

describe("gitleaksOutcome", () => {
  const leak = {
    RuleID: "generic-api-key",
    File: "src/config.ts",
    StartLine: 4,
    Commit: "0123456789abcdef0123456789abcdef01234567",
    Description: "Detected a Generic API Key",
  };
  const run = (status: number | null): ScanRun => ({
    status,
    signal: null,
    stdout: "",
    stderr: "scanning\nfatal: not a git repository",
  });

  it("passes a clean scan, and names each leak of a scan that found some", () => {
    expect(gitleaksOutcome(run(0), { json: [] })).toStrictEqual([]);
    expect(gitleaksOutcome(run(GITLEAKS_LEAK_EXIT), { json: [leak] })).toStrictEqual([
      "gitleaks: generic-api-key in src/config.ts:4, commit 0123456 (Detected a Generic API Key)",
    ]);
  });

  it("never takes a failed scan for a clean one", () => {
    // gitleaks' own code for a leak, 1, is also its code for a failure
    expect(gitleaksOutcome(run(1), { json: [] })).toStrictEqual([
      "gitleaks failed (exit 1): fatal: not a git repository",
    ]);
    expect(gitleaksOutcome(run(0), { problem: "gitleaks.json is missing" })).toStrictEqual([
      "gitleaks wrote no report: gitleaks.json is missing",
    ]);
    expect(gitleaksOutcome(run(GITLEAKS_LEAK_EXIT), { json: [] })).toStrictEqual([
      "gitleaks exited for leaks its report doesn't name",
    ]);
  });
});
