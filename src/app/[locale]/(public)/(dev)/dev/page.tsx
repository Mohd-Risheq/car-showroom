import { getLocale } from "next-intl/server";
import { directionOf } from "@/i18n/routing";

// Scaffold diagnostics (T-01): locale and direction under the public root layout
export default async function PublicDevPage() {
  const locale = await getLocale();

  return (
    <main className="p-8 font-mono text-sm">
      <h1 className="mb-4 text-lg">Muftah dev: public root layout</h1>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt>locale</dt>
        <dd>{locale}</dd>
        <dt>dir</dt>
        <dd>{directionOf(locale)}</dd>
        <dt>rendering</dt>
        <dd>prerendered at build (Cache Components)</dd>
      </dl>
      <p className="mt-6 text-base" lang="ar">
        مفتاح · شوف الفحص قبل ما تشوف السيارة · 14,500
      </p>
      <p className="mt-2 text-base" lang="en">
        Muftah · See the inspection before you see the car · 14,500
      </p>
    </main>
  );
}
