"use client";

import { Button } from "@/components/ui/button";
import { ExportIcon } from "@/components/ui/icons/export";
import { showToast } from "@/components/ui/toaster";
import { reportClientError, track } from "@/lib/analytics/track";
import { type SharedLink, shareLink } from "../domain/share";

// FR-09.11: Share opens the browser's share sheet where there is one, and elsewhere copies the
// car's canonical address and says so in a toast. A share that went through, either way, counts as
// share_native (API-03); a closed sheet counts nothing. Should the link be neither shared nor
// copied, the visitor is told, and the failure counts under SHARE (NFR-OBS-02). A sheet that failed
// for another reason counts under SHARE_SHEET, though the link was copied, so a broken sheet
// doesn't pass for a working copy. The server gives it its link and words (car-share.tsx).

type ShareButtonProps = {
  link: SharedLink;
  /** The car's id, which the share counts under */
  car: string;
  labels: { share: string; linkCopied: string; failed: string };
  /** Quiet in the title block, an outline button at the page's end */
  variant: "quiet" | "secondary";
};

export function ShareButton({ link, car, labels, variant }: ShareButtonProps) {
  async function share() {
    const { outcome, sheetError, copyError } = await shareLink(link, navigator);
    if (sheetError !== undefined) reportClientError("SHARE_SHEET", sheetError);
    if (outcome === "shared" || outcome === "copied") track("share_native", car);
    if (outcome === "copied") showToast(labels.linkCopied);
    if (outcome === "failed") {
      reportClientError("SHARE", copyError);
      showToast(labels.failed);
    }
  }

  return (
    <Button variant={variant} icon={<ExportIcon />} onClick={() => void share()}>
      {labels.share}
    </Button>
  );
}
