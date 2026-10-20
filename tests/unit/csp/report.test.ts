import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  blockedSource,
  createReportHandler,
  LINES_PER_MINUTE,
  MAX_REPORT_BYTES,
  routeTemplate,
} from "@/lib/csp/report";

// API-30 (SRS §8.2, §12.5) and NFR-OBS-01

const FIXTURES = path.join(process.cwd(), "tests/fixtures/csp-reports");
const ORIGIN = "http://localhost:3000";
const PAGE = `${ORIGIN}/en/cars/2021-toyota-corolla-hybrid-mu-24q7?utm_source=window`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const VIOLATION = {
  documentURL: PAGE,
  referrer: "",
  blockedURL: "https://evil.example/steal.js?token=secret",
  effectiveDirective: "script-src-elem",
  originalPolicy: "default-src 'self'",
  sourceFile: `${ORIGIN}/_next/static/chunks/main.js`,
  sample: "alert(1)",
  disposition: "enforce",
  statusCode: 200,
};

function reports(...bodies: Record<string, unknown>[]): string {
  return JSON.stringify(
    bodies.map((body) => ({ type: "csp-violation", age: 0, url: PAGE, user_agent: "test", body })),
  );
}

function post(body: string, contentType = "application/reports+json", headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/csp-report`, {
    method: "POST",
    body,
    headers: { "content-type": contentType, ...headers },
  });
}

function setup(random: () => number = () => 0) {
  const lines: string[] = [];
  let time = 0;
  const POST = createReportHandler({ random, now: () => time, log: (line) => lines.push(line) });
  return {
    POST,
    lines,
    logged: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("POST /api/csp-report", () => {
  it("logs the directive, the blocked origin and the page's route template, and nothing else", async () => {
    const { POST, lines, logged } = setup();
    const response = await POST(post(reports(VIOLATION)));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(logged()).toEqual([
      {
        level: "warn",
        code: "csp_violation",
        requestId: expect.stringMatching(UUID),
        route: "/api/csp-report",
        durationMs: expect.any(Number),
        directive: "script-src-elem",
        blocked: "https://evil.example",
        document: "/[locale]/cars/…",
      },
    ]);
    for (const leak of ["steal", "secret", "toyota", "utm", "alert", "default-src", "main.js", "localhost"]) {
      expect(lines[0]).not.toContain(leak);
    }
  });

  it("reads the older application/csp-report format", async () => {
    const { POST, logged } = setup();
    const body = JSON.stringify({
      "csp-report": {
        "document-uri": `${ORIGIN}/ar/dealer/cars/0192/edit?step=3`,
        "violated-directive": "style-src-elem 'self' 'nonce-abc'",
        "original-policy": "default-src 'self'",
        "blocked-uri": "inline",
        "line-number": 1,
      },
    });
    expect((await POST(post(body, "application/csp-report"))).status).toBe(204);
    expect(logged()).toMatchObject([{ directive: "style-src-elem", blocked: "inline", document: "/[locale]/dealer/…" }]);
  });

  it("drops reports caused by browser extensions", async () => {
    const { POST, lines } = setup();
    await POST(
      post(
        reports(
          { ...VIOLATION, sourceFile: "chrome-extension" },
          { ...VIOLATION, blockedURL: "moz-extension://4b1d/content.js" },
          { ...VIOLATION, sourceFile: "webkit-masked-url://hidden/" },
          { ...VIOLATION, blockedURL: "safari-web-extension://4b1d/inject.js" },
        ),
      ),
    );
    expect(lines).toEqual([]);
  });

  it("logs one report in ten", async () => {
    const kept = setup(() => 0.0999);
    await kept.POST(post(reports(VIOLATION)));
    expect(kept.lines).toHaveLength(1);
    const dropped = setup(() => 0.1);
    await dropped.POST(post(reports(VIOLATION)));
    expect(dropped.lines).toEqual([]);
  });

  it("takes bodies up to 8 KB and drops anything larger", async () => {
    const padded = (bytes: number) => {
      const base = reports({ ...VIOLATION, sample: "" });
      return reports({ ...VIOLATION, sample: "a".repeat(bytes - new TextEncoder().encode(base).byteLength) });
    };
    const { POST, lines } = setup();
    expect((await POST(post(padded(MAX_REPORT_BYTES)))).status).toBe(204);
    expect(lines).toHaveLength(1);
    expect((await POST(post(padded(MAX_REPORT_BYTES + 1)))).status).toBe(204);
    expect(lines).toHaveLength(1);
  });

  it("answers 204 and logs nothing for other content types, malformed bodies and other report types", async () => {
    const { POST, lines } = setup();
    const requests = [
      post(reports(VIOLATION), "application/json"),
      post(reports(VIOLATION), "text/plain"),
      post("{", "application/reports+json"),
      post("{", "application/csp-report"),
      post(JSON.stringify({ "csp-report": "x" }), "application/csp-report"),
      post(JSON.stringify({ type: "csp-violation", body: "x" }), "application/csp-report"),
      post(JSON.stringify([{ type: "deprecation", body: VIOLATION }])),
      post(JSON.stringify([null, 1, "x", { type: "csp-violation" }])),
    ];
    for (const request of requests) {
      const response = await POST(request);
      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
    }
    expect(lines).toEqual([]);
  });

  // Real bodies, as each engine sent them in T-06 (docs/evidence/T-06)
  it.each(readdirSync(FIXTURES).filter((name) => name.endsWith(".json")))(
    "logs the report %s sent",
    async (name) => {
      const fixture = JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8")) as {
        contentType: string;
        body: unknown;
      };
      const { POST, logged } = setup();
      const response = await POST(post(JSON.stringify(fixture.body), fixture.contentType));
      expect(response.status).toBe(204);
      const lines = logged();
      expect(lines).toHaveLength(Array.isArray(fixture.body) ? fixture.body.length : 1);
      for (const line of lines) {
        expect(line).toMatchObject({
          code: "csp_violation",
          directive: "style-src-elem",
          blocked: "inline",
          document: "/[locale]/dealer/…",
        });
      }
    },
  );

  it("takes one Reporting API report under either content type", async () => {
    for (const contentType of ["application/reports+json", "application/csp-report"]) {
      const { POST, logged } = setup();
      await POST(post(JSON.stringify({ type: "csp-violation", body: VIOLATION }), contentType));
      expect(logged()).toMatchObject([{ directive: "script-src-elem", blocked: "https://evil.example" }]);
    }
  });

  it("accepts a content type with parameters", async () => {
    const { POST, lines } = setup();
    await POST(post(reports(VIOLATION), "application/reports+json; charset=utf-8"));
    expect(lines).toHaveLength(1);
  });

  it("never logs a directive it doesn't recognise as one", async () => {
    const { POST, logged } = setup();
    await POST(post(reports({ ...VIOLATION, effectiveDirective: 'script-src"\n{"level":"error"' })));
    expect(logged()).toMatchObject([{ directive: "unknown" }]);
  });

  it(`logs at most ${LINES_PER_MINUTE} lines a minute per instance`, async () => {
    const { POST, lines, advance } = setup();
    const small = { effectiveDirective: "img-src", blockedURL: "https://a.example/x", documentURL: `${ORIGIN}/en` };
    const batch = reports(...Array.from({ length: 20 }, () => small));
    expect(new TextEncoder().encode(batch).byteLength).toBeLessThanOrEqual(MAX_REPORT_BYTES);
    for (let i = 0; i < 6; i += 1) await POST(post(batch));
    expect(lines).toHaveLength(LINES_PER_MINUTE);
    advance(59_999);
    await POST(post(reports(VIOLATION)));
    expect(lines).toHaveLength(LINES_PER_MINUTE);
    advance(1);
    await POST(post(reports(VIOLATION)));
    expect(lines).toHaveLength(LINES_PER_MINUTE + 1);
  });

  it("uses the platform's request ID when it has the expected shape", async () => {
    const { POST, logged } = setup();
    await POST(post(reports(VIOLATION), undefined, { "x-vercel-id": "fra1::iad1::abcde-1760000000000-0123456789ab" }));
    await POST(post(reports(VIOLATION), undefined, { "x-vercel-id": 'fra1" injected' }));
    expect(logged().map((line) => line.requestId)).toEqual([
      "fra1::iad1::abcde-1760000000000-0123456789ab",
      expect.stringMatching(UUID),
    ]);
  });
});

describe("blockedSource", () => {
  it("keeps keywords, schemes and origins only", () => {
    expect(blockedSource("inline")).toBe("inline");
    expect(blockedSource("eval")).toBe("eval");
    expect(blockedSource("wasm-eval")).toBe("wasm-eval");
    expect(blockedSource("data")).toBe("data:");
    expect(blockedSource("blob:http://localhost:3000/0192")).toBe("blob:");
    expect(blockedSource("https://cdn.example:8443/a/b.js?x=1#y")).toBe("https://cdn.example:8443");
    expect(blockedSource("wss://socket.example/live")).toBe("wss://socket.example");
    expect(blockedSource("https://user:pass@cdn.example/")).toBe("https://cdn.example");
    expect(blockedSource("")).toBe("unknown");
    expect(blockedSource("not a url")).toBe("unknown");
    expect(blockedSource(42)).toBe("unknown");
    expect(blockedSource(undefined)).toBe("unknown");
  });
});

describe("routeTemplate", () => {
  it("names the section and hides everything below it", () => {
    expect(routeTemplate(`${ORIGIN}/en`)).toBe("/[locale]");
    expect(routeTemplate(`${ORIGIN}/ar/`)).toBe("/[locale]");
    expect(routeTemplate(`${ORIGIN}/en/cars`)).toBe("/[locale]/cars");
    expect(routeTemplate(PAGE)).toBe("/[locale]/cars/…");
    expect(routeTemplate(`${ORIGIN}/ar/how-its-built`)).toBe("/[locale]/how-its-built");
    expect(routeTemplate(`${ORIGIN}/en/dealer/cars/0192/edit`)).toBe("/[locale]/dealer/…");
    expect(routeTemplate(`${ORIGIN}/en/private-name`)).toBe("/[locale]/…");
    expect(routeTemplate(`${ORIGIN}/fr/cars`)).toBe("/…");
    expect(routeTemplate(`${ORIGIN}/`)).toBe("/");
    expect(routeTemplate("about:blank")).toBe("/…");
    expect(routeTemplate("not a url")).toBe("unknown");
    expect(routeTemplate(null)).toBe("unknown");
  });
});
