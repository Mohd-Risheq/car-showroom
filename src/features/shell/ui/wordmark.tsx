import Link from "next/link";
import type { PublicFile } from "@/lib/db/public-dto";
import type { SitePath } from "../domain/pages";
import { wordmarkLength } from "../domain/wordmark";

// DESIGN §2 and §7.1.1: the header's start, a link home. The dealer's logo when settings have one
// (FR-35), else the dealer's name as the wordmark. The hide button of the demo banner sends the focus
// here (data-wordmark). The logo is a plain image: next/image, which shows it unoptimized all the
// same, brought its code to every public page's first load (D-049). A name too long for its last
// step is cut across with an ellipsis, and only across: an Arabic letter's bowl reaches further
// under the line than the font's descent, and a box that clipped both ways cut it (D-049). Clipping
// makes no scroll container, so min-w-0 lets the name shrink in the link's row.

type WordmarkProps = { href: SitePath; name: string; logo: PublicFile | null };

export function Wordmark({ href, name, logo }: WordmarkProps) {
  return (
    <Link href={href} data-wordmark className="pressable flex h-11 min-w-0 shrink items-center">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- shown as stored, with no script (D-049)
        <img src={logo.src} width={logo.width} height={logo.height} alt={name} className="h-8 w-auto" />
      ) : (
        <span data-length={wordmarkLength(name)} className="wordmark min-w-0 overflow-x-clip text-ellipsis">
          {name}
        </span>
      )}
    </Link>
  );
}
