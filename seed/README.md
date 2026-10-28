# Seed data

The demo showroom's data, loaded by `node scripts/seed.ts` and checked by `pnpm check:seed`.

- `cars.json` holds the demo cars. Every car, history, price and inspection in it is fictional.
- `reference.json` holds the makes, models and search aliases, and `places.json` the preset places, with their
  OpenStreetMap sources in `scripts/places.source.md`.
- `settings.json` holds the demo dealer's settings.

The seed cars' VINs are synthetic, so one could match a real car. They are kept in `seed-private/`, which is not
part of the public repository, and they never appear on public pages. A clone without that folder reports the VIN
check as skipped.
