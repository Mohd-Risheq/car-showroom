import { StaticRouteMap } from "@/features/journey/ui/static-map";
import { notFoundOnDeployments } from "@/lib/deployment";
import { placesOf, ROUTES } from "./fixture";
import { JourneySpike } from "./journey-spike";

// Spike T-09: does the Journey globe (cobe, arcs between the seed places) fit its 60 KB lazy chunk,
// and does the static map render without JavaScript (FR-17.5, FR-17.6, NFR-PERF-03)? T-42 builds
// the Journey on what it finds. The static maps come first; the globe sits more than a viewport
// further down, so its chunk loads only on the way there.

export default function JourneySpikePage() {
  notFoundOnDeployments();
  return (
    <main className="grid gap-8 bg-bg p-6 font-mono text-sm text-ink">
      <h1 className="text-lg">Muftah dev: Journey globe and static map (T-09)</h1>

      <section className="grid gap-6" data-testid="static-maps">
        <h2 className="text-base">Static maps (FR-17.6): SVG and CSS, no JavaScript</h2>
        {(["tc-17-1", "pacific"] as const).map((key) => (
          <figure key={key} className="grid max-w-180 gap-2" data-route={key}>
            <div className="bg-surface-1">
              <StaticRouteMap places={placesOf(key)} />
            </div>
            <figcaption className="text-muted">{ROUTES[key].title}</figcaption>
          </figure>
        ))}
      </section>

      <p className="min-h-[160vh] text-muted">
        The globe is further down. Its code loads when it comes within one viewport.
      </p>

      <JourneySpike
        maps={{
          "tc-17-1": <StaticRouteMap places={placesOf("tc-17-1")} />,
          pacific: <StaticRouteMap places={placesOf("pacific")} />,
        }}
      />
    </main>
  );
}
