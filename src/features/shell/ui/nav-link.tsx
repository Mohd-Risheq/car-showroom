"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { cn } from "@/lib/class-names";
import type { SitePath } from "../domain/pages";

// A link of the shell's navigation, in its nav landmark (DESIGN §8.1), marked as the current page on
// the page it opens: aria-current, and an underline in --scan beside the caller's colour, so the mark
// isn't colour alone and holds under more contrast, where all text takes --ink (DESIGN §7.1.1,
// §4.5). The path is read in the browser, inside a boundary, so a page that doesn't know its path
// when it is built, as a car's, still prerenders: its HTML marks nothing, and the mark comes with
// hydration.

/** The current page's underline */
const CURRENT_MARK =
  "aria-[current=page]:underline aria-[current=page]:decoration-2 aria-[current=page]:decoration-scan aria-[current=page]:underline-offset-8";

type NavLinkProps = { href: SitePath; className?: string; onNavigate?: () => void; children: ReactNode };

export function NavLink(props: NavLinkProps) {
  return (
    <Suspense fallback={<PageLink {...props} current={false} />}>
      <NavLinkOnPath {...props} />
    </Suspense>
  );
}

function NavLinkOnPath(props: NavLinkProps) {
  return <PageLink {...props} current={usePathname() === props.href} />;
}

function PageLink({ href, className, onNavigate, children, current }: NavLinkProps & { current: boolean }) {
  return (
    <Link
      href={href}
      className={cn(className, CURRENT_MARK)}
      aria-current={current ? "page" : undefined}
      {...(onNavigate === undefined ? {} : { onNavigate })}
    >
      {children}
    </Link>
  );
}
