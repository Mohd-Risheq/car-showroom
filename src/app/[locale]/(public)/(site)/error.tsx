"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { useShellStrings } from "@/features/shell/ui/shell-strings";

// SRS §13.3 and DESIGN §7.2.11: a page of the public site that fails to render shows this in its
// place, inside the shell, so the header, the footer and the rest of the site stay usable. Its line
// is the page's one heading (DESIGN §8.1), which a navigation's focus lands on (FR-02.4). Try again
// fetches and renders the page once more.
export default function SegmentError({ retry }: { error: unknown; retry: () => void }) {
  const strings = useShellStrings();
  return (
    <div role="alert" className="mx-auto flex max-w-content flex-col items-start gap-4 px-band py-16">
      <h1>{strings.segmentError}</h1>
      <Button icon={<ArrowClockwiseIcon />} onClick={() => retry()}>
        {strings.retry}
      </Button>
    </div>
  );
}
