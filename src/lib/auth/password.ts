import "server-only";
import { hash, verify } from "@node-rs/argon2";

// argon2id at the OWASP minimum (SEC-02), set explicitly so a library default cannot weaken it.
// The algorithm is the package default, argon2id: its `Algorithm` is a const enum, which
// isolatedModules cannot reference. Tests assert the `$argon2id$v=19$m=19456,t=2,p=1$` prefix.
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  return verify(data.hash, data.password);
}
