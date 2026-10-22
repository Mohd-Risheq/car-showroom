import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

// SEC-02: passwords are stored as argon2id at the OWASP minimum, whatever the library's defaults

describe("password hashing", () => {
  it("hashes with argon2id at 19 MiB, two passes and one lane, salted per hash", async () => {
    const first = await hashPassword("correct horse battery staple");
    const second = await hashPassword("correct horse battery staple");
    expect(first).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(second).not.toBe(first);
  });

  it("verifies the password it hashed, and nothing else", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword({ hash, password: "correct horse battery staple" })).toBe(true);
    expect(await verifyPassword({ hash, password: "correct horse battery stapler" })).toBe(false);
  });
});
