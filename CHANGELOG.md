# Changelog

Notable changes to Muftah, in the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. There is no release yet, so every change is under Unreleased.

## [Unreleased]

### Added

- The skeleton: Next.js 16 with the App Router, React 19, strict TypeScript, Tailwind CSS 4 and next-intl, serving Arabic at `/ar` and English at `/en`, each with its own language and direction.
- The data layer: Drizzle ORM on Neon's serverless driver, with Postgres 17 behind Neon's local proxy for local work and tests (`pnpm db:up`). The local database stores its password at one SCRAM iteration, as the proxy checks it on every request.
- Better Auth on the same database, behind `/api/auth`, and storage on Vercel Blob, with a local adapter for development and tests that refuses to run on a deployment.
- Content security policies for the showroom and for the dealer workspace, which takes a fresh nonce on every response.
- Readex Pro and Martian Mono through `next/font`, with fallback faces sized to match them.
- The design tokens, in one stylesheet: the showroom's dark theme, the workspace's Daylight and dark themes, the accents, type, space, shape and motion, with what changes under reduced motion, increased contrast and reduced transparency. Tailwind's theme is built on these values, and a lint rule keeps raw colours, lengths and timings out of the code.
- The components every screen is built from: buttons, fields, skeletons, empty states, inline errors, a draggable bottom sheet and toasts, each with the focus ring. GSAP loads only on desktop screens, once a scroll-driven section comes near.
- The Arabic and English message catalogs: every string the interface shows, enum labels and validation messages among them, with the plural forms each language needs. `pnpm i18n:messages` generates them from the specification's copy deck, and `check:i18n` holds them to it. Numbers use Western digits with grouping in both languages, and dates take Amman's time zone.
- Arabic and English routing: a path without a language goes to the visitor's chosen language, otherwise Arabic, and another language's prefix answers 404. The language switch opens the same page and query in the other language, and an Arabic page offers English to a browser whose first language is English. The choice is kept for a year, and `POST /api/locale` stores it from the server too, as Safari keeps a cookie the page writes for only 7 days. `lib/format` writes numbers, dates, units and phone numbers alike on the server and in every browser. Free-text fields follow the direction of what is typed, a long word breaks rather than overflows, and a table keeps its words whole, with ScrollFrame to scroll one too wide for its screen in a frame of its own. Lint rules keep layouts on logical properties and arrows mirrored in Arabic, and refuse Intl's formatters, `toLocaleString`, `toLocaleDateString`, `toLocaleTimeString` and next-intl's formatter outside `lib/format`.
- The data model of the specification, with its migrations, the input schemas forms and actions share, typed errors behind one error envelope, and structured logs. Queries on a dealer's data take their scope from one module, which keeps each dealer's rows, and each demo session's, apart. The user table gets its scope later, with staff accounts. Server Actions are built one way, which checks the origin, the session, the role, the input and the rate limit before the work runs. The rate limits are counted under keyed hashes in the database, with an in-memory limiter for the limits the specification keeps per instance.
- The public reads: the inventory, a car's page and the dealer's settings each come from one read-only snapshot, cached and tagged, so a change clears what it touched. The inventory index of 1,000 public cars builds within its 300 ms budget on a local database (137 ms at p95 on the development Mac). The figure on the hosted database is still to come. Its stored form stays under 1 MB. Reference codes, slugs, Arabic search folding, the inventory's time rules, the mileage check and the paint bands are tested domain modules, and the dealer's story joins the brand settings.
- Development pages from the technical spikes: the 360-degree spin viewer, the engine-sound player, the journey globe, the reel encoder, VIN scanning, Arabic canvas text and a type specimen. Every deployment answers them with 404.
- Code quality: ESLint with `jsx-a11y` and a rule against hard-coded copy, Prettier, and strict TypeScript.
- Tests: Vitest unit tests with coverage thresholds, integration tests against the local database, and Playwright journeys with axe accessibility checks and visual comparison, on Chromium, WebKit and Firefox.
- Custom checks for long dashes, bundle budgets, colour contrast and the message catalogs, and Lighthouse CI with a mobile performance budget.
- `pnpm verify` and `pnpm verify:full`, the gates every change passes.
- Supply-chain checks: `pnpm audit`, OSV-Scanner, gitleaks and a minimum-version floor, with each accepted advisory listed by ID with a review date.
- GitHub Actions workflows for the checks, CodeQL and a nightly supply-chain scan, and a Renovate configuration for weekly grouped updates that opens security fixes at once.

### Security

- Vercel Blob's copy of Zod runs the patched 4.6.7, and Lighthouse CI's body-parser the patched 1.20.9 (GHSA-mrhx-c7xc-m3w5, GHSA-27r3-jxmh-p828). Lighthouse CI's Zod 3, which no release fixes, is accepted for that one advisory until 2027-01-21, and an accepted advisory can now name the one installed version it covers.
