import "server-only";
import { ipAddress } from "@vercel/functions/headers";
import { networkSubject } from "./key";

// SEC-12's network for a request: the address Vercel puts in x-real-ip, as ipAddress() of
// @vercel/functions reads it, which Vercel writes itself rather than passing on a client's. Where
// there is none, as locally and in CI, or it isn't an address, the request counts in one shared
// bucket, never in none (D-043). Only the headers module is imported, which imports nothing.

/** The subject of the shared bucket, which no network's subject can be */
export const SHARED_NETWORK = "shared";

export function clientNetwork(request: Request): string {
  return networkSubject(ipAddress(request) ?? "") ?? SHARED_NETWORK;
}
