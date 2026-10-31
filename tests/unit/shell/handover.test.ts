import { describe, expect, it, vi } from "vitest";
import { handover } from "@/features/shell/ui/handover";

// The 404's handover (src/features/shell/ui/handover.ts): what a part of the view leaves as it goes is
// taken once by the part taking its place on the same address, in the same commit, as after hydration
// (D-047), and dropped once the commit is done.

/** Puts the page on an address, as window.location reads it */
function openAt(pathname: string, search = "") {
  vi.stubGlobal("window", { location: { pathname, search } });
}

/** Lets the commit end: the microtasks queued while it ran come next */
const commitDone = () => Promise.resolve();

describe("a handover", () => {
  it("gives the part taking another's place what that part left on the same address, once", () => {
    openAt("/en/nothing", "?q=1");
    const words = handover<string>();
    const first = words.arrive();
    expect(first.taken).toBeNull();
    first.leave("rav4");
    expect(words.arrive().taken).toBe("rav4");
    expect(words.arrive().taken).toBeNull();
  });

  it("gives nothing to a part on another address, and drops what was left", () => {
    openAt("/en/nothing");
    const words = handover<string>();
    words.arrive().leave("rav4");
    openAt("/en/nothing", "?q=1");
    expect(words.arrive().taken).toBeNull();
    openAt("/en/nothing");
    expect(words.arrive().taken).toBeNull();
  });

  it("leaves a thing under the address its part came in on, as the address may change before it goes", () => {
    openAt("/en/nothing");
    const words = handover<string>();
    const { leave } = words.arrive();
    openAt("/en/cars");
    leave("rav4");
    expect(words.arrive().taken).toBeNull();
    openAt("/en/nothing");
    words.arrive().leave("rav4");
    expect(words.arrive().taken).toBe("rav4");
  });

  it("drops what no part took by the end of the commit, so a later visit starts afresh", async () => {
    openAt("/en/nothing");
    const words = handover<string>();
    words.arrive().leave("rav4");
    await commitDone();
    expect(words.arrive().taken).toBeNull();
  });

  it("keeps each kind of thing apart", () => {
    openAt("/en/nothing");
    const words = handover<string>();
    const places = handover<number>();
    words.arrive().leave("rav4");
    places.arrive().leave(2);
    expect(places.arrive().taken).toBe(2);
    expect(words.arrive().taken).toBe("rav4");
  });
});
