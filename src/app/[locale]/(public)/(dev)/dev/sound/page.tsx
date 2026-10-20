import { SoundSpike } from "./sound-spike";

// Spike T-07: does a tap start Web Audio on iOS, with the silent switch on and off, and does the
// needle follow the analyser (FR-15, BR-19)? T-40 builds the Hear It card on what it finds.
export default function SoundSpikePage() {
  return (
    <main className="grid gap-4 p-6 font-mono text-sm">
      <h1 className="text-lg">Muftah dev: Web Audio on iOS (T-07)</h1>
      <SoundSpike />
    </main>
  );
}
