import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionFrame } from "@/features/car-page/ui/sections";
import { notFoundOnDeployments } from "@/lib/deployment";
import { BrokenIsland, Hydrated, LoadedIsland } from "./islands";

// T-21's section lab (FR-09.7, DESIGN §7.2.3): two sections in the car page's frames, well below the
// fold, each with an island that nearViewport loads. The first comes in once its section is within
// one viewport of the screen, in place of its skeleton; the second throws, so its section shows its
// line while the rest of the page stays whole. tests/e2e/sections-lab.spec.ts drives it.

/** Three screens of nothing, which put the next section well below the one before */
function Distance() {
  return (
    <div aria-hidden="true">
      <div className="h-screen" />
      <div className="h-screen" />
      <div className="h-screen" />
    </div>
  );
}

export default async function SectionsLabPage() {
  notFoundOnDeployments();
  const t = await getTranslations();
  const failure = t("car.sectionError");
  return (
    <main className="mx-auto flex max-w-content flex-col gap-section px-band py-12">
      <h1 className="type-head">Muftah dev: car page sections (T-21)</h1>
      <Hydrated />
      <Distance />
      <SectionFrame id="lab-loaded" title="An island that loads near the screen">
        <LoadedIsland island={{ text: "The island is in" }} failure={failure}>
          <Skeleton className="h-40" />
        </LoadedIsland>
      </SectionFrame>
      <Distance />
      <SectionFrame id="lab-broken" title="An island that throws">
        <BrokenIsland island={{}} failure={failure}>
          <p className="type-body">The section&apos;s static form</p>
        </BrokenIsland>
      </SectionFrame>
    </main>
  );
}
