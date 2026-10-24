import { notFoundOnDeployments } from "@/lib/deployment";
import { directionOf } from "@/lib/i18n/locales";
import { getAppLocale } from "@/lib/i18n/server";

// Scaffold diagnostics (T-01): locale and direction under the dealer root layout
export default async function DealerDevPage() {
  notFoundOnDeployments();
  const locale = await getAppLocale();

  return (
    <main className="p-8 font-mono text-sm">
      <h1 className="mb-4 text-lg">Muftah dev: dealer root layout</h1>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt>locale</dt>
        <dd>{locale}</dd>
        <dt>dir</dt>
        <dd>{directionOf(locale)}</dd>
        <dt>rendering</dt>
        <dd>per request (the root layout reads headers)</dd>
      </dl>
    </main>
  );
}
