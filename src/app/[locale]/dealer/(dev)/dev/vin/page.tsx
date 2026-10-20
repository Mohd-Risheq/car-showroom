import { VinSpike } from "./vin-spike";

// Spike T-10 (FR-36.2): "Scan VIN" with the browser's own barcode detector or the zxing-wasm
// polyfill, whose .wasm is self-hosted. It sits in the dealer workspace, whose policies allow
// WebAssembly and the camera (D-028, SEC-15), as the wizard's step 1 will. T-49 builds on it.
export default function VinSpikePage() {
  return (
    <main className="grid gap-4 p-6 font-mono text-sm">
      <h1 className="text-lg">Muftah dev: VIN scanning (T-10)</h1>
      <VinSpike />
    </main>
  );
}
