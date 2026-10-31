import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "./not-found-view";

// A page's localized 404 (SRS §11.5 rule 13, D-047), for the catch-all and for any page whose subject
// isn't there. The page renders the view, in the shell, and notFound() is thrown inside a Suspense
// boundary: thrown at the top, it would fail the server render, whose document then holds no view
// and no language, as React's server renderer has no error boundaries. Inside the boundary, the
// prerender records the 404 status and keeps the view. Next.js adds noindex to the page's head.

/** The 404's title, which the site layout's template completes with the dealer's name */
export async function notFoundMetadata(): Promise<Metadata> {
  const t = await getTranslations("errors.notFound");
  return { title: t("title") };
}

function NotFoundStatus(): never {
  notFound();
}

export function NotFoundPage() {
  return (
    <>
      <NotFoundView />
      <Suspense fallback={null}>
        <NotFoundStatus />
      </Suspense>
    </>
  );
}
