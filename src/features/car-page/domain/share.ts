// FR-09.11: Share hands the car's link to the browser's share sheet where there is one, and copies it
// where there isn't. The sheet may also refuse a link, or fail for want of permission, and the link
// is copied then too; a visitor who closes the sheet has chosen not to share, and nothing follows.
// A share gives what failed on its way, so the page can report it (NFR-OBS-02).

/** What a share takes: the page's title and its canonical address */
export type SharedLink = { readonly title: string; readonly url: string };

/** The browser's parts a share uses, each missing where the browser lacks it */
type Sharing = {
  readonly share?: (data: ShareData) => Promise<void>;
  readonly canShare?: (data: ShareData) => boolean;
  readonly clipboard?: { readonly writeText: (text: string) => Promise<void> };
};

/**
 * How a share ended, through the sheet, by a copied link, closed by the visitor, or not at all, and
 * the errors on its way: the sheet's, where it failed for a reason other than its closing, and the
 * copy's
 */
type ShareResult = {
  readonly outcome: "shared" | "copied" | "cancelled" | "failed";
  readonly sheetError?: unknown;
  readonly copyError?: unknown;
};

/** The visitor closed the share sheet (Web Share's AbortError) */
const isClosed = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/** Shares the link, or copies it, through the browser's parts given (navigator, on a page) */
export async function shareLink(link: SharedLink, browser: Sharing): Promise<ShareResult> {
  const data = { title: link.title, url: link.url };
  if (browser.share === undefined || browser.canShare?.(data) === false) return copyLink(link.url, browser);
  try {
    await browser.share(data);
    return { outcome: "shared" };
  } catch (error) {
    if (isClosed(error)) return { outcome: "cancelled" };
    return { ...(await copyLink(link.url, browser)), sheetError: error };
  }
}

/** Copies the link's address, where the browser has a clipboard */
async function copyLink(url: string, { clipboard }: Sharing): Promise<ShareResult> {
  if (clipboard === undefined) return { outcome: "failed" };
  try {
    await clipboard.writeText(url);
    return { outcome: "copied" };
  } catch (error) {
    return { outcome: "failed", copyError: error };
  }
}
