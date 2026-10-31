"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/lib/i18n/locales";

/**
 * Writes a new query over the lab's history entry through the router, as T-24's filters will: no new
 * entry and no scroll, and the router writes the entry's state anew
 */
export function ReplaceQueryButton({ locale }: { locale: AppLocale }) {
  const router = useRouter();
  return (
    <Button variant="secondary" onClick={() => router.replace(`/${locale}/dev/shell?view=replaced`, { scroll: false })}>
      Replace the query
    </Button>
  );
}
