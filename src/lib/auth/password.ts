import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { ARGON2_OPTIONS } from "./argon2-options";

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  return verify(data.hash, data.password);
}
