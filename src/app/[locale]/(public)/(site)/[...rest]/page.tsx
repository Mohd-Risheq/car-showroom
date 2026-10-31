import type { Metadata } from "next";
import { notFoundMetadata, NotFoundPage } from "@/features/shell/ui/not-found-page";

// Any public path no page has: the localized 404 (SRS §11.5 rule 13, D-047), under the 404's title,
// as the page itself renders without throwing (not-found-page.tsx)

export async function generateMetadata(): Promise<Metadata> {
  return notFoundMetadata();
}

export default function UnknownPage() {
  return <NotFoundPage />;
}
