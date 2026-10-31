import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  DEMO_BANNER_HIDDEN,
  DEMO_BANNER_KEY,
  DEMO_BANNER_SCRIPT,
  hideDemoBanner,
} from "@/features/shell/domain/demo-banner";

// FR-02.3: once the visitor hides the demo banner it stays hidden for the browser session. The head
// script marks <html> before the first paint of every page after, and session storage may be
// blocked, as in some private windows.

/** Session storage holding these entries, or storage a browser blocks, which throws on every use */
function storage(entries: Record<string, string> | "blocked") {
  if (entries === "blocked") {
    const refuse = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    return { getItem: refuse, setItem: refuse };
  }
  const stored = new Map(Object.entries(entries));
  return {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    stored,
  };
}

/** Runs the head script in a page of its own, as the browser runs it, and gives back the <html> mark */
function markAfterHeadScript(sessionStorage: ReturnType<typeof storage>): string | undefined {
  const dataset: Record<string, string> = {};
  runInNewContext(DEMO_BANNER_SCRIPT, { sessionStorage, document: { documentElement: { dataset } } });
  return dataset.demoBanner;
}

describe("the head script", () => {
  it("marks <html> when this session hid the banner", () => {
    expect(markAfterHeadScript(storage({ [DEMO_BANNER_KEY]: DEMO_BANNER_HIDDEN }))).toBe(DEMO_BANNER_HIDDEN);
  });

  it("leaves it unmarked otherwise", () => {
    expect(markAfterHeadScript(storage({}))).toBeUndefined();
    expect(markAfterHeadScript(storage({ [DEMO_BANNER_KEY]: "shown" }))).toBeUndefined();
  });

  it("leaves it unmarked, and the page running, where storage is blocked", () => {
    expect(markAfterHeadScript(storage("blocked"))).toBeUndefined();
  });
});

describe("hideDemoBanner", () => {
  function page(sessionStorage: ReturnType<typeof storage>) {
    const dataset: Record<string, string> = {};
    vi.stubGlobal("document", { documentElement: { dataset } });
    vi.stubGlobal("sessionStorage", sessionStorage);
    return dataset;
  }

  it("hides the banner on this page and for the rest of the session", () => {
    const session = storage({});
    const dataset = page(session);
    hideDemoBanner();
    expect(dataset.demoBanner).toBe(DEMO_BANNER_HIDDEN);
    expect(session.stored?.get(DEMO_BANNER_KEY)).toBe(DEMO_BANNER_HIDDEN);
    expect(markAfterHeadScript(session)).toBe(DEMO_BANNER_HIDDEN);
  });

  it("still hides it on this page where storage is blocked", () => {
    const dataset = page(storage("blocked"));
    hideDemoBanner();
    expect(dataset.demoBanner).toBe(DEMO_BANNER_HIDDEN);
  });
});
