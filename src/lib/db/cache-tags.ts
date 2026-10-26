// The cache tags of SRS §11.4 and §8.1. An action returns the tags its write makes stale, and
// defineAction updates each after the commit (§11.9). The nightly jobs expire the dealer's tag, so
// the time rules the cached functions compute are never more than a day late.

/** The index, and a slug that found no car */
export const carsTag = (dealerId: string) => `cars:${dealerId}`;

/** One car's page */
export const carTag = (carId: string) => `car:${carId}`;

/** Every public entry of the dealer: the settings, and the other two's time rules */
export const dealerTag = (dealerId: string) => `dealer:${dealerId}`;
