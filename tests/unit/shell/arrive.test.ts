import { afterEach, describe, expect, it, vi } from "vitest";
import { ARRIVAL_WAIT_MS, arrive, titleAnnouncer } from "@/features/shell/ui/arrive";

// FR-02.4's arrival on a new page (src/features/shell/ui/arrive.ts): the focus moves to the page's
// visible heading, or to its main, or after a step back or forward to the control the page was left
// by, once the page can take it, and the title is announced at once when it is in place, else as
// soon as it comes (D-047). The e2e test meets a late title only on a busy machine, so each path is
// driven here, on a stand-in for the page: an element says whether it is visible and hidden and
// whether it takes the focus, a frame runs when the test steps it, and the head's observer runs
// when the head changes.

/**
 * A page's element as arrive reads and focuses it. It has no checkVisibility(), which Safari has only
 * from 17.4, where SRS C-09 makes iOS Safari 16.4 first-class. Its inert and aria-hidden stand for its
 * own and its ancestors'.
 */
class PageElement {
  readonly visible: boolean;
  inert = false;
  ariaHidden = false;
  /** Whether it refuses the focus, as a control disabled since the page was left does */
  refusesFocus = false;
  focused: FocusOptions[] = [];
  #tabIndex: number | null;

  constructor({ visible = true, tabIndex = null }: { visible?: boolean; tabIndex?: number | null } = {}) {
    this.visible = visible;
    this.#tabIndex = tabIndex;
  }

  get tabIndex(): number | null {
    return this.#tabIndex;
  }

  set tabIndex(value: number) {
    this.#tabIndex = value;
  }

  hasAttribute(name: string): boolean {
    return name === "tabindex" && this.#tabIndex !== null;
  }

  /** A box while it shows; none inside the display: none that keeps a page for a quick return */
  getClientRects(): object[] {
    return this.visible ? [{}] : [];
  }

  /** Itself for a selector list naming a state it is in */
  closest(selector: string): PageElement | null {
    const states = new Map([
      ["[inert]", this.inert],
      ['[aria-hidden="true"]', this.ariaHidden],
    ]);
    const parts = selector.split(",").map((part) => part.trim());
    for (const part of parts) if (!states.has(part)) throw new Error(`no stand-in for ${part}`);
    return parts.some((part) => states.get(part)) ? this : null;
  }

  focus(options: FocusOptions): void {
    this.focused.push(options);
    if (!this.refusesFocus) focusTaken.push(this);
  }
}

/** The elements that took the stand-in page's focus, the last of which has it */
const focusTaken: PageElement[] = [];

/** The page's main, with its headings */
class MainElement extends PageElement {
  readonly headings: PageElement[];

  constructor(headings: PageElement[], options?: { tabIndex?: number | null }) {
    super(options);
    this.headings = headings;
  }

  querySelectorAll(selector: string): PageElement[] {
    return selector === "h1" ? this.headings : [];
  }
}

/** Frames 16 ms apart, from this time */
const START_MS = 1000;
const FRAME_MS = 16;

/** Puts the page in place of the document, and gives the test its frames and its head */
function stubPage(main: MainElement | null) {
  const head = {};
  const observers: { callback: () => void; options: MutationObserverInit | null }[] = [];
  const frames = new Map<number, () => void>();
  let lastFrame = 0;
  let now = START_MS;

  class HeadObserver {
    readonly callback: () => void;
    options: MutationObserverInit | null = null;

    constructor(callback: () => void) {
      this.callback = callback;
      observers.push(this);
    }

    observe(target: object, options: MutationObserverInit): void {
      expect(target).toBe(head);
      this.options = options;
    }

    disconnect(): void {
      this.options = null;
    }
  }

  focusTaken.length = 0;
  vi.stubGlobal("document", {
    head,
    getElementById: (id: string) => (id === "content" ? main : null),
    get activeElement() {
      return focusTaken.at(-1) ?? null;
    },
  });
  vi.stubGlobal("MutationObserver", HeadObserver);
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    lastFrame += 1;
    frames.set(lastFrame, callback);
    return lastFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (frame: number) => frames.delete(frame));
  vi.spyOn(performance, "now").mockImplementation(() => now);

  return {
    /** The next frame: the time moves on, and what asked for the frame runs */
    step(): void {
      now += FRAME_MS;
      const due = [...frames.values()];
      frames.clear();
      for (const run of due) run();
    },
    /** A change to the head, as when a title streams in: every observer still watching hears it */
    headChanges(): void {
      for (const observer of observers) if (observer.options !== null) observer.callback();
    },
    /** What the head's observers watch for, while any watches */
    watching: () => observers.find(({ options }) => options !== null)?.options ?? null,
    framesAsked: () => frames.size,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("arrive", () => {
  it("focuses the page's visible heading without scrolling, past one kept hidden, by its boxes", () => {
    const kept = new PageElement({ visible: false });
    const heading = new PageElement();
    stubPage(new MainElement([kept, heading]));
    arrive(() => true);
    expect(heading.focused).toStrictEqual([{ preventScroll: true }]);
    expect(heading.tabIndex).toBe(-1);
    expect(kept.focused).toStrictEqual([]);
    expect(kept.hasAttribute("tabindex")).toBe(false);
  });

  it("focuses main where no heading shows, and keeps the tabindex it has", () => {
    const main = new MainElement([new PageElement({ visible: false })], { tabIndex: 0 });
    stubPage(main);
    arrive(() => true);
    expect(main.focused).toStrictEqual([{ preventScroll: true }]);
    expect(main.tabIndex).toBe(0);
  });

  it("focuses the control a step's page was left by without scrolling, and leaves the heading alone", () => {
    const heading = new PageElement();
    const link = new PageElement();
    stubPage(new MainElement([heading]));
    const announceTitle = vi.fn(() => true);
    arrive(announceTitle, link as unknown as HTMLElement);
    expect(link.focused).toStrictEqual([{ preventScroll: true }]);
    expect(link.hasAttribute("tabindex")).toBe(false);
    expect(heading.focused).toStrictEqual([]);
    expect(heading.hasAttribute("tabindex")).toBe(false);
    expect(announceTitle).toHaveBeenCalledTimes(1);
  });

  it("focuses the heading when the control refuses the focus, as one disabled since does", () => {
    const heading = new PageElement();
    const button = new PageElement();
    button.refusesFocus = true;
    stubPage(new MainElement([heading]));
    arrive(() => true, button as unknown as HTMLElement);
    expect(button.focused).toStrictEqual([{ preventScroll: true }]);
    expect(heading.focused).toStrictEqual([{ preventScroll: true }]);
    expect(heading.tabIndex).toBe(-1);
  });

  it("waits while the control's page is hidden behind a closing sheet, then focuses the control", () => {
    const heading = new PageElement();
    const link = new PageElement();
    link.ariaHidden = true;
    const page = stubPage(new MainElement([heading]));
    const announceTitle = vi.fn(() => true);
    arrive(announceTitle, link as unknown as HTMLElement);
    page.step();
    expect(link.focused).toStrictEqual([]);
    expect(announceTitle).not.toHaveBeenCalled();
    link.ariaHidden = false;
    page.step();
    expect(link.focused).toStrictEqual([{ preventScroll: true }]);
    expect(heading.focused).toStrictEqual([]);
    expect(announceTitle).toHaveBeenCalledTimes(1);
  });

  it("does nothing on a page without main", () => {
    stubPage(null);
    const announceTitle = vi.fn(() => true);
    expect(arrive(announceTitle)).toBeUndefined();
    expect(announceTitle).not.toHaveBeenCalled();
  });

  it("announces the title at once when it is in place, and watches nothing", () => {
    const page = stubPage(new MainElement([new PageElement()]));
    const announceTitle = vi.fn(() => true);
    arrive(announceTitle);
    expect(announceTitle).toHaveBeenCalledTimes(1);
    expect(page.watching()).toBeNull();
  });

  it("waits for a title still to come, announces it as it comes, then stops watching", () => {
    const page = stubPage(new MainElement([new PageElement()]));
    // The last page's title at first, still after another change to the head, then the new one
    const announceTitle = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValue(true);
    arrive(announceTitle);
    expect(page.watching()).toStrictEqual({ childList: true, subtree: true, characterData: true });
    page.headChanges();
    expect(announceTitle).toHaveBeenCalledTimes(2);
    expect(page.watching()).not.toBeNull();
    page.headChanges();
    expect(announceTitle).toHaveBeenCalledTimes(3);
    expect(page.watching()).toBeNull();
    page.headChanges();
    expect(announceTitle).toHaveBeenCalledTimes(3);
  });

  it("waits while the page is inert, which would refuse the focus, then focuses and announces", () => {
    const heading = new PageElement();
    heading.inert = true;
    const page = stubPage(new MainElement([heading]));
    const announceTitle = vi.fn(() => true);
    arrive(announceTitle);
    page.step();
    page.step();
    expect(heading.focused).toStrictEqual([]);
    expect(announceTitle).not.toHaveBeenCalled();
    heading.inert = false;
    page.step();
    expect(heading.focused).toStrictEqual([{ preventScroll: true }]);
    expect(announceTitle).toHaveBeenCalledTimes(1);
    expect(page.framesAsked()).toBe(0);
  });

  it("waits while a modal sheet leaves the page aria-hidden, then focuses and announces", () => {
    // Base UI's modal sheet hides the rest of the page from assistive technology with aria-hidden while
    // it is open, and a closing one until its cleanup runs, as when Back closes the menu (C2)
    const heading = new PageElement();
    heading.ariaHidden = true;
    const page = stubPage(new MainElement([heading]));
    const announceTitle = vi.fn(() => true);
    arrive(announceTitle);
    page.step();
    expect(heading.focused).toStrictEqual([]);
    expect(announceTitle).not.toHaveBeenCalled();
    heading.ariaHidden = false;
    page.step();
    expect(heading.focused).toStrictEqual([{ preventScroll: true }]);
    expect(announceTitle).toHaveBeenCalledTimes(1);
    expect(page.framesAsked()).toBe(0);
  });

  it("gives up on a page still hidden after 2 s", () => {
    expect(ARRIVAL_WAIT_MS).toBe(2000);
    const heading = new PageElement();
    heading.ariaHidden = true;
    const page = stubPage(new MainElement([heading]));
    const announceTitle = vi.fn(() => true);
    arrive(announceTitle);
    const framesInWait = ARRIVAL_WAIT_MS / FRAME_MS;
    for (let frame = 1; frame < framesInWait; frame += 1) page.step();
    expect(page.framesAsked()).toBe(1);
    page.step();
    expect(page.framesAsked()).toBe(0);
    heading.ariaHidden = false;
    page.step();
    expect(heading.focused).toStrictEqual([]);
    expect(announceTitle).not.toHaveBeenCalled();
  });

  it("stops waiting for the focus, or for the title, once cancelled, as when the next page comes first", () => {
    const heading = new PageElement();
    heading.ariaHidden = true;
    const waitingForFocus = stubPage(new MainElement([heading]));
    const announceTitle = vi.fn(() => false);
    arrive(announceTitle)?.();
    heading.ariaHidden = false;
    waitingForFocus.step();
    expect(heading.focused).toStrictEqual([]);

    const waitingForTitle = stubPage(new MainElement([new PageElement()]));
    const cancel = arrive(announceTitle);
    expect(waitingForTitle.watching()).not.toBeNull();
    cancel?.();
    expect(waitingForTitle.watching()).toBeNull();
  });
});

describe("titleAnnouncer", () => {
  it("gives a title that is neither empty nor the last one, from the first page's", () => {
    const announcer = titleAnnouncer("Home");
    // The first page's title, which the browser reads out itself as the page loads
    expect(announcer("")).toBeNull();
    expect(announcer("Home")).toBeNull();
    expect(announcer("Cars")).toBe("Cars");
    // The same title again, as between two unknown paths, and an empty one before metadata streams in
    expect(announcer("Cars")).toBeNull();
    expect(announcer("")).toBeNull();
    expect(announcer("Home")).toBe("Home");
  });
});
