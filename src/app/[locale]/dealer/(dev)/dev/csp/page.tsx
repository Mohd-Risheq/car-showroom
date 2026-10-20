import { headers } from "next/headers";
import { CspProbe } from "@/app/_dev/csp-probe/csp-probe";

// Spike T-06: the dealer policy (SRS §12.5), with a fresh nonce per request, against the same
// libraries as the public probe plus the WASM barcode scanner
export default async function DealerCspProbePage() {
  // Motion takes the nonce as a prop; Base UI reads it from the root layout's CSPProvider
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <main className="grid gap-4 p-6 font-mono text-sm">
      <h1 className="text-lg">Muftah dev: dealer CSP probe (T-06)</h1>
      <CspProbe side="dealer" nonce={nonce} />
    </main>
  );
}
