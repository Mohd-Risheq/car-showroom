import type { Metadata } from "next";
import { notFoundMetadata } from "@/features/shell/ui/not-found-page";
import { NotFoundView } from "@/features/shell/ui/not-found-view";

// The site's 404 inside its shell. The browser renders it after hydration, in place of the view a
// page rendered on the server (not-found-page.tsx, D-047). Next.js reads its title for a page whose
// own metadata throws notFound(), as a page whose subject isn't there does.

export async function generateMetadata(): Promise<Metadata> {
  return notFoundMetadata();
}

export default function NotFound() {
  return <NotFoundView />;
}
