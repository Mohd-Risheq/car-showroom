import { notFoundOnDeployments } from "@/lib/deployment";
import { getAppLocale } from "@/lib/i18n/server";
import { CanvasSpike } from "./canvas-spike";

// Spike T-04 (R-01): does the browser shape, join, order and wrap Arabic on a canvas?
export default async function CanvasSpikePage() {
  notFoundOnDeployments();
  const locale = await getAppLocale();
  return (
    <main className="grid gap-4 p-6 font-mono text-sm">
      <h1 className="text-lg">Muftah dev: Arabic canvas text (T-04)</h1>
      <CanvasSpike locale={locale} />
    </main>
  );
}
