import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NotFoundPage } from "@/features/shell/ui/not-found-page";
import { notFoundOnDeployments } from "@/lib/deployment";

// T-19: a page whose subject isn't there, as a car page for a car that has gone (T-21). Its metadata
// and its content both find nothing, so its title is the one not-found.tsx gives, which
// tests/e2e/not-found.spec.ts reads (D-047).

export function generateMetadata(): Metadata {
  notFound();
}

export default function GoneDevPage() {
  notFoundOnDeployments();
  return <NotFoundPage />;
}
