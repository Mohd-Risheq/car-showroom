import Image from "next/image";
import Link from "next/link";
import type { PublicFile } from "@/lib/db/public-dto";
import type { SitePath } from "../domain/pages";
import { wordmarkLength } from "../domain/wordmark";

// DESIGN §2 and §7.1.1: the header's start, a link home. The dealer's logo when settings have one
// (FR-35), else the dealer's name as the wordmark. The hide button of the demo banner sends the focus
// here (data-wordmark).

type WordmarkProps = { href: SitePath; name: string; logo: PublicFile | null };

export function Wordmark({ href, name, logo }: WordmarkProps) {
  return (
    <Link href={href} data-wordmark className="flex h-11 min-w-0 shrink items-center">
      {logo ? (
        <Image src={logo.src} width={logo.width} height={logo.height} alt={name} unoptimized className="h-8 w-auto" />
      ) : (
        <span data-length={wordmarkLength(name)} className="wordmark truncate">
          {name}
        </span>
      )}
    </Link>
  );
}
