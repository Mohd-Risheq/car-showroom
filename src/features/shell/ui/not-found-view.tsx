import { MagnifyingGlassIcon } from "@phosphor-icons/react/ssr";
import Form from "next/form";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { getAppLocale } from "@/lib/i18n/server";
import { pagePath } from "../domain/pages";
import { NotFoundFocus } from "./not-found-focus";
import { NotFoundSearch } from "./not-found-search";
import { NotFoundStage } from "./not-found-stage";

// SCR-11's 404 (DESIGN §7.2.11): the empty bay, what happened and what to do next, a search of all
// cars and the way to the cars and home. The catch-all renders it on the server and not-found.tsx in
// the browser, the same view, so the swap after hydration doesn't show (D-047), and the stage, the
// search and the keyboard's focus carry what they had across it. The search sends its words to the
// cars page as q (FR-08), which works without JavaScript too.
export async function NotFoundView() {
  const locale = await getAppLocale();
  const t = await getTranslations("errors.notFound");
  const nav = await getTranslations("nav");
  const palette = await getTranslations("palette");
  const cars = pagePath(locale, "cars");

  return (
    <NotFoundFocus className="mx-auto flex max-w-content flex-col gap-8 px-band py-12 md:py-20">
      <NotFoundStage />
      <div className="flex max-w-measure flex-col gap-3">
        <h1 className="type-head">{t("title")}</h1>
        <p className="type-lead text-muted">{t("body")}</p>
      </div>
      <Form action={cars} role="search" className="flex w-full max-w-measure gap-2">
        <NotFoundSearch
          name="q"
          type="search"
          enterKeyHint="search"
          aria-label={nav("search")}
          placeholder={palette("placeholder")}
        />
        <Button type="submit" variant="primary" size="icon" aria-label={nav("search")}>
          <MagnifyingGlassIcon />
        </Button>
      </Form>
      <div className="flex flex-wrap gap-3">
        <Link href={cars} className={buttonClasses({ variant: "secondary" })}>
          {nav("cars")}
        </Link>
        <Link href={pagePath(locale, "home")} className={buttonClasses({ variant: "quiet" })}>
          {nav("home")}
        </Link>
      </div>
    </NotFoundFocus>
  );
}
