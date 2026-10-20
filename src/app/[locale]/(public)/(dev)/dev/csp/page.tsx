import { CspProbe } from "@/app/_dev/csp-probe/csp-probe";

// Spike T-06: the public policy (SRS §12.5) against every library that sets styles, injects tags
// or runs code outside the page's own scripts. Prerendered, like every public page. The WASM
// scanner runs only on the dealer probe, because the public policy has no 'wasm-unsafe-eval'.
export default function PublicCspProbePage() {
  return (
    <main className="grid gap-4 p-6 font-mono text-sm">
      <h1 className="text-lg">Muftah dev: public CSP probe (T-06)</h1>
      <CspProbe side="public" />
    </main>
  );
}
