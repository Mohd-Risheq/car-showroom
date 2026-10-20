import { notFoundOnDeployments } from "@/lib/deployment";
import { SpinSpike } from "./spin-spike";

// Spike T-05: does a 36-frame spin hold 55 fps with no long task over 50 ms, with its decoded
// frames inside 60 MB on phones (NFR-PERF-04, NFR-PERF-07)? T-41 builds on what it finds.
export default function SpinSpikePage() {
  notFoundOnDeployments();
  return (
    <main className="grid gap-4 p-6 font-mono text-sm">
      <h1 className="text-lg">Muftah dev: spin viewer performance (T-05)</h1>
      <SpinSpike />
    </main>
  );
}
