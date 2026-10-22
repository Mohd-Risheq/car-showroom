import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "../../../scripts/eslint/no-hardcoded-copy.mjs";

// The hard-coded strings check of BUILD-PLAN §6.2: copy in JSX text, rendered string literals
// and the user-facing attributes fails; catalog lookups, text without letters and code pass. An
// attribute is user-facing even on or inside a code element.

RuleTester.describe = describe;
RuleTester.it = it;
const tester = new RuleTester({ languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } });

const text = (shown: string) => ({ messageId: "text", data: { text: shown } });
const attribute = (name: string, shown: string) => ({ messageId: "attribute", data: { attribute: name, text: shown } });

tester.run("no-hardcoded-copy", rule, {
  valid: [
    "<p>{t('car.price')}</p>",
    "<img alt='' src={src} />",
    "<img alt={t('car.photo', { index })} src={src} />",
    "<span>{price} · {mileage}</span>",
    "<span>360° / 4 × 2 (3)</span>",
    "<p>   </p>",
    "<code>pnpm verify</code>",
    "<pre><span>DATABASE_URL=postgres://</span></pre>",
    "<kbd>Esc</kbd>",
    "<div className='grid gap-4' data-state='open' lang='ar' dir='rtl' />",
    "<p>{format('Not copy, a call argument')}</p>",
    "<Image alt={photo.alt} />",
    "<input placeholder={t('search.placeholder')} />",
    "<p>{'Sold' && price}</p>",
    { code: "<p data-x='Words'>{x}</p>", options: [{ attributes: ["aria-label"] }] },
  ],
  invalid: [
    { code: "<p>Book a viewing</p>", errors: [text("Book a viewing")] },
    { code: "<p>احجز موعدًا</p>", errors: [text("احجز موعدًا")] },
    { code: "<p>{'Sold'}</p>", errors: [text("Sold")] },
    { code: "<p>{`Sold`}</p>", errors: [text("Sold")] },
    { code: "<p>{sold ? 'Sold' : t('car.available')}</p>", errors: [text("Sold")] },
    { code: "<p>{sold && 'Sold'}</p>", errors: [text("Sold")] },
    { code: "<p>{'Price: ' + price}</p>", errors: [text("Price:")] },
    { code: "<><b>Hi</b></>", errors: [text("Hi")] },
    { code: "<img alt='Front of the car' src={src} />", errors: [attribute("alt", "Front of the car")] },
    { code: "<button aria-label={'Close'} />", errors: [attribute("aria-label", "Close")] },
    { code: "<abbr title={`Kilometres`}>km</abbr>", errors: [attribute("title", "Kilometres"), text("km")] },
    { code: "<input placeholder={empty ? 'Search' : ''} />", errors: [attribute("placeholder", "Search")] },
    { code: "<p>{'Guest' || name}</p>", errors: [text("Guest")] },
    { code: "<p>{'Untitled' ?? label}</p>", errors: [text("Untitled")] },
    { code: "<input placeholder={'Search' || hint} />", errors: [attribute("placeholder", "Search")] },
    { code: "<code title='Copy'>pnpm verify</code>", errors: [attribute("title", "Copy")] },
    {
      code: "<pre><button aria-label='Copy the command' /></pre>",
      errors: [attribute("aria-label", "Copy the command")],
    },
    {
      code: "<p data-x='Words'>{x}</p>",
      options: [{ attributes: ["data-x"] }],
      errors: [attribute("data-x", "Words")],
    },
    {
      code: "<p>An inspection the dealer declares, panel by panel, before the car is listed</p>",
      errors: [text("An inspection the dealer declares, panel…")],
    },
  ],
});
