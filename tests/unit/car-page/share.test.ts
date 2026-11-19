import { describe, expect, it, vi } from "vitest";
import { shareLink } from "@/features/car-page/domain/share";

// FR-09.11: Share hands the car's link to the browser's share sheet where there is one, and copies it
// where there isn't, or where the sheet failed for any reason but the visitor closing it. It gives
// what failed on its way, so the page can report it (NFR-OBS-02).

const LINK = {
  title: "2019 Toyota Land Cruiser GXR",
  url: "https://showroom.example/en/cars/2019-toyota-land-cruiser-gxr-mu-3hk8",
};

const refusal = (name: string) => new DOMException("The share sheet answered", name);

/** A clipboard that takes the text, and the text it took */
function clipboard() {
  const copied: string[] = [];
  const writeText = vi.fn((text: string) => {
    copied.push(text);
    return Promise.resolve();
  });
  return { copied, clipboard: { writeText } };
}

describe("shareLink", () => {
  it("opens the share sheet where the browser has one, and copies nothing", async () => {
    const share = vi.fn(() => Promise.resolve());
    const { copied, clipboard: board } = clipboard();
    expect(await shareLink(LINK, { share, canShare: () => true, clipboard: board })).toStrictEqual({
      outcome: "shared",
    });
    expect(share).toHaveBeenCalledExactlyOnceWith(LINK);
    expect(copied).toStrictEqual([]);
  });

  it("does nothing more when the visitor closes the sheet, which is no failure", async () => {
    const { copied, clipboard: board } = clipboard();
    const share = () => Promise.reject(refusal("AbortError"));
    expect(await shareLink(LINK, { share, clipboard: board })).toStrictEqual({ outcome: "cancelled" });
    expect(copied).toStrictEqual([]);
  });

  it("copies the link where the sheet failed for another reason, and gives the sheet's error", async () => {
    for (const name of ["NotAllowedError", "InvalidStateError", "DataError"]) {
      const { copied, clipboard: board } = clipboard();
      const error = refusal(name);
      const shared = await shareLink(LINK, { share: () => Promise.reject(error), clipboard: board });
      expect(shared, name).toStrictEqual({ outcome: "copied", sheetError: error });
      expect(shared.sheetError, name).toBe(error);
      expect(copied, name).toStrictEqual([LINK.url]);
    }
  });

  it("copies the link where the browser has no share sheet, or one that can't take a link", async () => {
    const plain = clipboard();
    expect(await shareLink(LINK, { clipboard: plain.clipboard })).toStrictEqual({ outcome: "copied" });
    expect(plain.copied).toStrictEqual([LINK.url]);

    const share = vi.fn(() => Promise.resolve());
    const refusing = clipboard();
    expect(await shareLink(LINK, { share, canShare: () => false, clipboard: refusing.clipboard })).toStrictEqual({
      outcome: "copied",
    });
    expect(share).not.toHaveBeenCalled();
    expect(refusing.copied).toStrictEqual([LINK.url]);
  });

  it("fails where the link can't be copied either, and gives each error", async () => {
    const copyError = refusal("NotAllowedError");
    const writeText = () => Promise.reject(copyError);
    const copying = await shareLink(LINK, { clipboard: { writeText } });
    expect(copying).toStrictEqual({ outcome: "failed", copyError });
    expect(copying.copyError).toBe(copyError);

    const sheetError = refusal("NotAllowedError");
    const sharing = await shareLink(LINK, { share: () => Promise.reject(sheetError), clipboard: { writeText } });
    expect(sharing).toStrictEqual({ outcome: "failed", sheetError, copyError });
    expect(sharing.sheetError).toBe(sheetError);
    expect(sharing.copyError).toBe(copyError);

    // An insecure page has no clipboard, and nothing failed but the share
    expect(await shareLink(LINK, {})).toStrictEqual({ outcome: "failed" });
  });
});
