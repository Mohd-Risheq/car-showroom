# Changelog

Notable changes to Muftah, in the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. There is no release yet, so every change is under Unreleased.

## [Unreleased]

### Added

- The skeleton: Next.js 16 with the App Router, React 19, strict TypeScript, Tailwind CSS 4 and next-intl, serving Arabic at `/ar` and English at `/en`, each with its own language and direction.
- The data layer: Drizzle ORM on Neon's serverless driver, with Postgres 17 behind Neon's local proxy for local work and tests (`pnpm db:up`).
- Better Auth on the same database, behind `/api/auth`, and storage on Vercel Blob, with a local adapter for development and tests that refuses to run on a deployment.
- Content security policies for the showroom and for the dealer workspace, which takes a fresh nonce on every response.
- Readex Pro and Martian Mono through `next/font`, with fallback faces sized to match them.
- The design tokens, in one stylesheet: the showroom's dark theme, the workspace's Daylight and dark themes, the accents, type, space, shape and motion, with what changes under reduced motion, increased contrast and reduced transparency. Tailwind's theme is built on these values, and a lint rule keeps raw colours, lengths and timings out of the code.
- The components every screen is built from: buttons, fields, skeletons, empty states, inline errors, a draggable bottom sheet and toasts, each with the focus ring. GSAP loads only on desktop screens, once a scroll-driven section comes near.
- The Arabic and English message catalogs: every string the interface shows, enum labels and validation messages among them, with the plural forms each language needs. `pnpm i18n:messages` generates them from the specification's copy deck, and `check:i18n` holds them to it. Numbers use Western digits with grouping in both languages, and dates take Amman's time zone.
- Arabic and English routing: a path without a language goes to the visitor's chosen language, otherwise Arabic, and another language's prefix answers 404. The language switch opens the same page and query in the other language, and an Arabic page offers English to a browser whose first language is English. The choice is kept for a year, and `POST /api/locale` stores it from the server too, as Safari keeps a cookie the page writes for only 7 days. `lib/format` writes numbers, dates, units and phone numbers alike on the server and in every browser. Free-text fields follow the direction of what is typed, a long word breaks rather than overflows, and a table keeps its words whole, with ScrollFrame to scroll one too wide for its screen in a frame of its own. Lint rules keep layouts on logical properties and arrows mirrored in Arabic, and refuse Intl's formatters, `toLocaleString`, `toLocaleDateString`, `toLocaleTimeString` and next-intl's formatter outside `lib/format`.
- Development pages from the technical spikes: the 360-degree spin viewer, the engine-sound player, the journey globe, the reel encoder, VIN scanning, Arabic canvas text and a type specimen. Every deployment answers them with 404.
- Code quality: ESLint with `jsx-a11y` and a rule against hard-coded copy, Prettier, and strict TypeScript.
- Tests: Vitest unit tests with coverage thresholds, integration tests against the local database, and Playwright journeys with axe accessibility checks and visual comparison, on Chromium, WebKit and Firefox.
- Custom checks for long dashes, bundle budgets, colour contrast and the message catalogs, and Lighthouse CI with a mobile performance budget.
- `pnpm verify` and `pnpm verify:full`, the gates every change passes.
- Supply-chain checks: `pnpm audit`, OSV-Scanner, gitleaks and a minimum-version floor, with each accepted advisory listed by ID with a review date.
- GitHub Actions workflows for the checks, CodeQL and a nightly supply-chain scan, and a Renovate configuration for weekly grouped updates that opens security fixes at once.
