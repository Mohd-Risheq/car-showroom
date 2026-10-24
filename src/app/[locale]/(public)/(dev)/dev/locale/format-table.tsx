"use client";

import { useSyncExternalStore } from "react";
import { ScrollFrame } from "@/components/ui/scroll-frame";
import { type AppLocale, directionOf } from "@/lib/i18n/locales";
import { SAMPLES } from "./samples";

type FormatTableProps = {
  locale: AppLocale;
  /** Each sample as the server wrote it, in SAMPLES's order */
  onServer: readonly string[];
};

const subscribe = () => () => {};

/**
 * How a sample sits in its cell (DESIGN §9.4): a number left to right and whole, and a date as text
 * in its language, which a left-to-right isolate would reorder: "18 تشرين الأول 2026" would read as
 * month, year, day.
 */
function isolationOf(date: boolean, locale: AppLocale) {
  return date ? { dir: directionOf(locale) } : { dir: "ltr" as const, className: "whitespace-nowrap" };
}

/** Each sample as the server wrote it, and as this browser writes it after hydration */
export function FormatTable({ locale, onServer }: FormatTableProps) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  return (
    // Wider than a phone's screen, so it scrolls in a frame of its own
    <ScrollFrame label="Formats" lang="en" dir="ltr">
      <table className="w-full border-collapse text-start">
        <thead>
          <tr>
            <th scope="col">Sample</th>
            <th scope="col">Server</th>
            <th scope="col">Browser</th>
          </tr>
        </thead>
        <tbody data-hydrated={hydrated}>
          {SAMPLES.map(({ id, show, date = false }, index) => (
            <tr key={id} data-sample={id} className="border-t border-line">
              <th scope="row" className="py-1 font-normal text-muted">
                {id}
              </th>
              <td data-written="server" lang={locale}>
                <bdi {...isolationOf(date, locale)}>{onServer[index]}</bdi>
              </td>
              <td data-written="browser" lang={locale}>
                <bdi {...isolationOf(date, locale)}>{hydrated ? show(locale) : null}</bdi>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollFrame>
  );
}
