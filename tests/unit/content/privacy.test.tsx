import { readFileSync } from "node:fs";
import { evaluate } from "@mdx-js/mdx";
import { getCookies } from "better-auth/cookies";
import { getTableColumns } from "drizzle-orm";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EVENT_SUBJECTS, SERVER_COUNTED } from "@/lib/analytics/events";
import { SESSION_EXPIRES_SECONDS } from "@/lib/auth/session-policy";
import { rateLimit, session } from "@/lib/db/schema";
import { TIME_ZONE } from "@/lib/i18n/intl-locale";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/lib/i18n/locale-cookie";
import { type AppLocale, LOCALES } from "@/lib/i18n/locales";
import { LONGEST_WINDOW_SECONDS } from "@/lib/rate-limit/limit";
import { ROUTE_LIMITS } from "@/lib/rate-limit/routes";
import { useMDXComponents } from "@/mdx-components";

// SCR-14's privacy page (FR-47.5, NFR-PRIV-04): each language's MDX, compiled with the site's
// elements as the build compiles it. Both languages say the same in the same shape, and the figures
// they state are the code's, so a change to one fails here until the page says it too.

const source = (locale: AppLocale) => readFileSync(`src/content/privacy/${locale}.mdx`, "utf8");

async function markupOf(locale: AppLocale): Promise<string> {
  const { default: Content } = await evaluate(source(locale), { ...runtime, useMDXComponents });
  return renderToStaticMarkup(<Content />);
}

const PAGES = Object.fromEntries(
  await Promise.all(LOCALES.map(async (locale) => [locale, await markupOf(locale)] as const)),
) as Record<AppLocale, string>;

/** The page's text, as a reader gets it */
const textOf = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");

/** The text of the page's section under the heading */
const sectionOf = (markup: string, heading: string) =>
  textOf(markup.split("<h2").find((section) => section.includes(`>${heading}</h2>`)) ?? "");

/** Each row the table keeps a thing in: its heading's text, then its cells', by the heading */
function rowsOf(markup: string): Map<string, string[]> {
  const rows = markup.split("<tbody>")[1]?.split("<tr").slice(1) ?? [];
  const cellsOf = (row: string) =>
    [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(([, cell = ""]) =>
      textOf(cell).replace(/\s+/g, " ").trim(),
    );
  return new Map(rows.map(cellsOf).map((cells) => [cells[0] ?? "", cells.slice(1)]));
}

/**
 * Each thing the site keeps, by its heading in each language, with how long and where in each, so
 * a change to one language fails until the other says it too
 */
const KEPT = [
  {
    en: [
      "Visit counts",
      "Indefinitely, as they hold nothing about any one person",
      "The site's database, in Frankfurt",
    ],
    ar: ["أعداد الزيارات", "دون حد زمني، فهي لا تحمل شيئًا عن أي شخص بعينه", "قاعدة بيانات الموقع، في فرانكفورت"],
  },
  {
    en: [
      "Limit counters",
      "Until an hour after the network's last message, then deleted at the site's next checks",
      "The site's database, in Frankfurt",
    ],
    ar: [
      "عدّادات حد الطلبات",
      "حتى ساعة بعد آخر رسالة من الشبكة، ثم تُحذف في عمليات التحقق التالية للموقع",
      "قاعدة بيانات الموقع، في فرانكفورت",
    ],
  },
  {
    en: ["Log lines", "As long as the hosting plan keeps logs", "Vercel, the site's host"],
    ar: ["سطور السجل", "ما دامت خطة الاستضافة تحتفظ بالسجلات", "Vercel، الجهة المستضيفة للموقع"],
  },
  {
    en: ["The owner's account", "Until the account is removed", "The site's database, in Frankfurt"],
    ar: ["حساب المالك", "حتى حذف الحساب", "قاعدة بيانات الموقع، في فرانكفورت"],
  },
  {
    en: [
      "The owner's sign-ins",
      "Until the owner signs out in that browser or the account is removed, even after the sign-in has ended",
      "The site's database, in Frankfurt",
    ],
    ar: [
      "جلسات دخول المالك",
      "حتى يسجّل المالك خروجه من ذلك المتصفح أو يُحذف الحساب، ولو بعد انتهاء الجلسة",
      "قاعدة بيانات الموقع، في فرانكفورت",
    ],
  },
  {
    en: [
      "The owner's sign-in cookie",
      "Up to 7 days after the owner last used the dealer side, or until the browser closes for a sign-in made not to be remembered",
      "The owner's browser",
    ],
    ar: [
      "ملف تعريف الارتباط لدخول المالك",
      "حتى 7 أيام بعد آخر استخدام للوحة المعرض، أو حتى إغلاق المتصفح إن طُلب ألا يُتذكَّر تسجيل الدخول",
      "متصفح المالك",
    ],
  },
  {
    en: ["Your language", "A year from your last choice", "Your browser"],
    ar: ["لغتك", "سنة من آخر اختيار", "متصفحك"],
  },
  {
    en: ["Your place on each page", "Until you close the tab", "Your browser"],
    ar: ["موضعك في كل صفحة", "حتى إغلاق علامة التبويب", "متصفحك"],
  },
  {
    en: ["The demo notice", "Until you close the tab", "Your browser"],
    ar: ["تنويه النسخة التجريبية", "حتى إغلاق علامة التبويب", "متصفحك"],
  },
] as const satisfies readonly Record<AppLocale, readonly [string, string, string]>[];

/** How many of each element the page has: its shape */
function shapeOf(markup: string): Record<string, number> {
  const tags = ["h1", "h2", "p", "ul", "li", "table", "tr", 'th scope="col"', 'th scope="row"', "td"];
  return Object.fromEntries(tags.map((tag) => [tag, markup.split(`<${tag}`).length - 1]));
}

describe("the privacy page's words", () => {
  it("start at h2, below the h1 the page renders, and have one table of what the site keeps", () => {
    expect(shapeOf(PAGES.en)).toMatchObject({ h1: 0, table: 1, 'th scope="col"': 5, 'th scope="row"': 9, td: 36 });
  });

  it("have the same shape in both languages", () => {
    expect(shapeOf(PAGES.ar)).toStrictEqual(shapeOf(PAGES.en));
  });

  it("carry no class names, styles, imports or exports, so every class is in src/mdx-components.tsx", () => {
    for (const locale of LOCALES) {
      expect(source(locale)).not.toMatch(/\bclass(?:Name)?\s*=|\bstyle\s*=|^(?:import|export)\s/m);
    }
  });

  it.each(KEPT.map((kept, row) => ({ ...kept, row })))(
    "keep row $row's how long and where the same in both languages",
    ({ en, ar }) => {
      const [enHeading, ...enCells] = en;
      const [arHeading, ...arCells] = ar;
      expect(rowsOf(PAGES.en).get(enHeading)?.slice(-2)).toStrictEqual(enCells);
      expect(rowsOf(PAGES.ar).get(arHeading)?.slice(-2)).toStrictEqual(arCells);
    },
  );

  it("list every row the table has, in its order", () => {
    for (const locale of LOCALES) {
      expect([...rowsOf(PAGES[locale]).keys()]).toStrictEqual(KEPT.map((kept) => kept[locale][0]));
    }
  });

  it("list the language cookie by name (D-041), kept a year, as the code keeps it", () => {
    expect(LOCALE_COOKIE_MAX_AGE).toBe(365 * 24 * 60 * 60);
    const cookieRow = (locale: AppLocale) =>
      textOf(PAGES[locale].split("<tr").find((row) => row.includes(LOCALE_COOKIE)) ?? "");
    expect(cookieRow("en")).toContain("A year from your last choice");
    expect(cookieRow("ar")).toContain("سنة من آخر اختيار");
  });

  it("state API-03's limit of 60 a minute from one network, as the code sets it", () => {
    expect(ROUTE_LIMITS["API-03"]).toStrictEqual({ max: 60, windowSeconds: 60 });
    expect(textOf(PAGES.en)).toContain("60 messages a minute from one network");
    expect(textOf(PAGES.ar)).toContain("60 رسالة في الدقيقة من شبكة واحدة");
  });

  it("say what a limit counter holds, as its table keeps it", () => {
    // blocked_until stays empty until BR-42's lock writes it (T-28), which adds it to the row
    expect(Object.keys(getTableColumns(rateLimit))).toStrictEqual(["key", "windowStart", "count", "blockedUntil"]);
    expect(rowsOf(PAGES.en).get("Limit counters")?.[0]).toBe(
      "For each network that sent messages, a coded key, how many it sent in the current minute and when that minute began",
    );
    expect(rowsOf(PAGES.ar).get("عدّادات حد الطلبات")?.[0]).toBe(
      "لكل شبكة أرسلت رسائل، مفتاح مرمّز، وعدد ما أرسلته في الدقيقة الجارية، ووقت بدء هذه الدقيقة",
    );
  });

  it("say what a sign-in holds, as its table keeps it", () => {
    // ip_address stays empty (SEC-02), and step_up_at until the step-up action writes it (API-32),
    // which adds it to the row; id and user_id tie the sign-in to the owner's account
    expect(Object.keys(getTableColumns(session))).toStrictEqual([
      "id",
      "expiresAt",
      "token",
      "createdAt",
      "updatedAt",
      "ipAddress",
      "userAgent",
      "userId",
      "stepUpAt",
    ]);
    expect(rowsOf(PAGES.en).get("The owner's sign-ins")?.[0]).toBe(
      "For each sign-in, a random token, the browser's name, version and system as it reports them, and when it began, was last extended and ends",
    );
    expect(rowsOf(PAGES.ar).get("جلسات دخول المالك")?.[0]).toBe(
      "لكل تسجيل دخول: رمز عشوائي، واسم المتصفح وإصداره ونظامه كما يصفها المتصفح، ووقت بدء الجلسة وآخر تمديد لها وموعد انتهائها",
    );
  });

  it("keep a limit counter until an hour after the last message, as the purge deletes it", () => {
    expect(LONGEST_WINDOW_SECONDS).toBe(60 * 60);
    expect(textOf(PAGES.en)).toContain("Until an hour after the network's last message");
    expect(textOf(PAGES.ar)).toContain("حتى ساعة بعد آخر رسالة من الشبكة");
  });

  it("say Global Privacy Control stops the messages, and the site ignores any that carry it (FR-47.3)", () => {
    for (const locale of LOCALES) expect(textOf(PAGES[locale])).toContain("Global Privacy Control");
    expect(textOf(PAGES.en)).toContain(
      "the site's pages send no messages, and the site ignores any message that carries the signal",
    );
    expect(textOf(PAGES.ar)).toContain("فلن ترسل صفحات الموقع أي رسالة، وسيُهمل الموقع أي رسالة تحمل هذه الإشارة");
  });

  it("count each day by the date in Amman, as the ingest does (BR-03)", () => {
    expect(TIME_ZONE).toBe("Asia/Amman");
    expect(textOf(PAGES.en)).toContain("by the date in Amman");
    expect(textOf(PAGES.ar)).toContain("بحسب تاريخ عمّان");
  });

  it("count the drag race for the whole site, under no car, as API-03 does", () => {
    expect(EVENT_SUBJECTS.race_run).toBe("site");
    const raceItem = (locale: AppLocale, race: string) =>
      textOf(PAGES[locale].split("<li").find((item) => item.includes(race)) ?? "");
    expect(raceItem("en", "drag race")).toContain("counted for the whole site rather than for a car");
    expect(raceItem("ar", "السباق")).toContain("ويُحسب للموقع كله لا لسيارة بعينها");
  });

  it("list no window card's scan or visit to the demo among the messages, as API-03 drops both", () => {
    // API-29 and API-04 count them on the server alone (the owner, 2026-11-01)
    expect(SERVER_COUNTED).toStrictEqual(["window_scan", "demo_dealer_entered"]);
    const counted = { en: sectionOf(PAGES.en, "What the site counts"), ar: sectionOf(PAGES.ar, "ما يحسبه الموقع") };
    expect(counted.en).toContain("the site drops any other");
    expect(counted.en).not.toMatch(/window card|demo/i);
    expect(counted.ar).toContain("ويُهمل الموقع ما سواه");
    expect(counted.ar).not.toMatch(/بطاقة الزجاج|التجريبية/);
  });

  it("name the owner's sign-in cookies as the site sets them over HTTPS, kept 7 days as auth.ts sets", () => {
    expect(SESSION_EXPIRES_SECONDS).toBe(7 * 24 * 60 * 60);
    // The names and the life the auth library gives its cookies on a site served over HTTPS
    const { sessionToken, dontRememberToken } = getCookies({
      baseURL: "https://muftah.example",
      session: { expiresIn: SESSION_EXPIRES_SECONDS },
    });
    expect(sessionToken.attributes.maxAge).toBe(SESSION_EXPIRES_SECONDS);
    const headings = { ar: "ملفات تعريف الارتباط", en: "Cookies" } as const;
    for (const locale of LOCALES) {
      const cookies = sectionOf(PAGES[locale], headings[locale]);
      expect(cookies).toContain(sessionToken.name);
      expect(cookies).toContain(dontRememberToken.name);
    }
    expect(rowsOf(PAGES.en).get("The owner's sign-in cookie")?.at(-2)).toMatch(/^Up to 7 days after/);
    expect(rowsOf(PAGES.ar).get("ملف تعريف الارتباط لدخول المالك")?.at(-2)).toMatch(/^حتى 7 أيام بعد/);
  });
});
