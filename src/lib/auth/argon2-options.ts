// argon2id at the OWASP minimum (SEC-02), set explicitly so a library default cannot weaken it.
// The algorithm is the package default, argon2id: its `Algorithm` is a const enum, which
// isolatedModules cannot reference. The app's password module and scripts/create-owner.ts both hash
// with these, so the two can't drift. The script loads this module under plain Node, so it has no
// imports. Tests assert the `$argon2id$v=19$m=19456,t=2,p=1$` prefix.
export const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
