# Muftah

Muftah is a bilingual showroom website and phone-first listing tool for independent used-car dealers in Jordan, in Arabic first and English second. It is being built to show every car's inspection, engine sound, origin and running cost.

**Status:** early development.

## Stack

Next.js 16, React 19 and TypeScript, with Tailwind CSS 4, next-intl, Drizzle ORM on Neon Postgres, Better Auth and Vercel Blob. Tests use Vitest and Playwright.

## Running it locally

You need Node.js 22, Docker, and pnpm 10: `corepack enable` gives the version `package.json` names.

```sh
pnpm install
cp .env.example .env.local   # then fill in the three empty secrets, as the file explains
pnpm db:up                   # Postgres 17 behind Neon's local proxy
pnpm db:migrate
node scripts/seed.ts         # the reference data, and with DEMO_MODE=true the demo dealer and its 29 cars
pnpm dev                     # http://localhost:3000
```

The site shows the dealer `DEALER_SLUG` names, so `pnpm dev` and `pnpm build` need that dealer in the database first: with the values in `.env.example`, the seed's demo dealer.

`node scripts/create-owner.ts` creates the dealer's first owner from `OWNER_EMAIL` and `OWNER_NAME`, and leaves the password in `.owner-password`, which only you can read: sign in with it, change it, then delete the file.

Local work never touches a real service: the database runs in Docker, and `STORAGE_DRIVER=local` keeps uploads in `.storage-local/`.

## Checks

| Command                                                                           | What it runs                                                                                                                                                 |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm verify`                                                                     | lint, typecheck, the migration check, unit and integration tests, the i18n, dash, contrast and seed checks, the production build and the bundle budgets      |
| `pnpm verify:full`                                                                | `verify`, then the Playwright suite (on this machine's browsers and in Playwright's Linux image), Lighthouse CI and the supply-chain audit                   |
| `pnpm test` / `pnpm test:int`                                                     | Vitest unit tests with coverage thresholds / integration tests, then the index benchmark, against the local database                                         |
| `pnpm e2e`                                                                        | Playwright journeys and axe checks on the production build (`pnpm build` first)                                                                              |
| `pnpm e2e:linux`                                                                  | the same suite with its browsers in Playwright's pinned Linux image, which adds Firefox and the visual comparison; `--update-snapshots` writes new baselines |
| `pnpm lhci`                                                                       | Lighthouse CI on the production build, mobile, on Home, Inventory and the car page as each is built; the budget is in `lighthouserc.json`                    |
| `pnpm audit:deps`                                                                 | the version floor, `pnpm audit`, OSV-Scanner and gitleaks                                                                                                    |
| `pnpm check:dashes`, `check:bundle`, `check:contrast`, `check:i18n`, `check:seed` | the custom checks, all five part of `verify`                                                                                                                 |

## Architecture

| Path                         | What it holds                                                                                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/[locale]/(public)`  | the showroom, in Arabic at `/ar` and English at `/en`                                                                                                                                                             |
| `src/app/[locale]/dealer`    | the dealer workspace, a second root layout with its own content security policy                                                                                                                                   |
| `src/app/api`                | route handlers                                                                                                                                                                                                    |
| `src/proxy.ts`               | the locale redirect, the dealer workspace's nonce and policy, and the 404 that keeps development pages off deployments                                                                                            |
| `src/features/`              | one folder per feature, with its components and logic                                                                                                                                                             |
| `src/lib/`                   | the database (Drizzle on Neon's serverless driver), auth, storage, the content security policies, HTTP helpers, validation, and `format/`, which writes numbers, dates, units and phone numbers in both languages |
| `src/lib/i18n/`, `messages/` | next-intl's routing and formatting locale, the visitor's stored language, and the Arabic and English message catalogs                                                                                             |
| `(dev)` route groups         | development pages from the technical spikes, under `/{locale}/dev` and `/{locale}/dealer/dev`                                                                                                                     |
| `drizzle/`                   | database migrations                                                                                                                                                                                               |
| `scripts/`                   | the scripts behind the `pnpm` commands, the seed and the owner's account; `scripts/checks/` holds the custom checks' logic, and `scripts/eslint/` the project's own lint rules                                    |
| `seed/`                      | the data `node scripts/seed.ts` loads: the makes, models and places every dealer shares, and the demo dealer's settings and cars                                                                                  |
| `tests/`                     | unit, integration, end-to-end, accessibility and visual tests, with their fixtures                                                                                                                                |

Comments cite sections of the project's specification, which lives in a private repository: SRS for behaviour, DESIGN for visuals and BUILD-PLAN for process. [CHANGELOG.md](CHANGELOG.md) lists the changes so far.

## Licence

GNU Affero General Public License v3.0 only (`AGPL-3.0-only`). See [LICENSE](LICENSE).
