// BR-12: Jordan sets fuel prices monthly. Prices set more than 35 days ago remind the dealer in the
// fuel-price settings (FR-35), and more than 45 days ago Cost to Run shows its caution note
// (FR-18) and Needs attention lists it (FR-30). Prices never set count as stale on both (owner,
// 24 Oct 2026). Days are elapsed 24-hour periods (TC-18-4, TC-35-7).

const DAY_MS = 86_400_000;
const REMINDER_DAYS = 35;
const PUBLIC_NOTE_DAYS = 45;

export type PriceStaleness = { readonly reminder: boolean; readonly publicNote: boolean };

export function priceStaleness(pricesUpdatedAt: Date | null, now: Date): PriceStaleness {
  if (pricesUpdatedAt === null) return { reminder: true, publicNote: true };
  const age = now.getTime() - pricesUpdatedAt.getTime();
  return { reminder: age > REMINDER_DAYS * DAY_MS, publicNote: age > PUBLIC_NOTE_DAYS * DAY_MS };
}
