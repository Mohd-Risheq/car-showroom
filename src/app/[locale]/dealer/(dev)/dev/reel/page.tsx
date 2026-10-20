import { ReelSpike } from "./reel-spike";

// Spike T-08 (FR-43): canvas frames and the engine clip encoded to MP4 in a worker, with WebCodecs
// and Mediabunny. It sits in the dealer workspace, whose policy allows the blob: preview (SRS
// §12.5), as Reel It will. T-66 builds Reel It on the path recorded in D-030.
export default function ReelSpikePage() {
  return (
    <main className="grid gap-4 p-6 font-mono text-sm">
      <h1 className="text-lg">Muftah dev: MP4 in the browser (T-08)</h1>
      <ReelSpike />
    </main>
  );
}
