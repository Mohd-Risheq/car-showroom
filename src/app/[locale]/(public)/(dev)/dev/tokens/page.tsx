import type { Metadata } from "next";
import { SPECIMEN_COPY } from "@/app/_dev/specimen/copy";
import { Demos } from "@/app/_dev/specimen/demos";
import { ScrubDemo, SpringDemo } from "@/app/_dev/specimen/motion-demos";
import {
  Accents,
  MotionTokens,
  Placard,
  Section,
  Shapes,
  Spacing,
  Swatches,
  TypeSteps,
} from "@/app/_dev/specimen/sections";
import { SpecimenPage } from "@/app/_dev/specimen/specimen-page";
import { TokenList } from "@/app/_dev/specimen/token-list";
import { notFoundOnDeployments } from "@/lib/deployment";
import { getAppLocale } from "@/lib/i18n/server";

// T-13: the public site's tokens (DESIGN §3 and §4) as components take them, the base controls on
// them, and every custom property the stylesheets declare. /dealer/dev/tokens shows the workspace's.

export const metadata: Metadata = { title: "Muftah dev: tokens, public site" };

export default async function PublicTokensPage() {
  notFoundOnDeployments();
  const locale = await getAppLocale();
  const copy = SPECIMEN_COPY[locale];

  return (
    <SpecimenPage title="Muftah dev: tokens, public site (T-13)" locale={locale} path="/dev/tokens">
      <Section id="colour" title="Colour and the accent presets, DESIGN §3.1">
        <Swatches />
        <Accents />
      </Section>
      <Section id="type" title="Type scale, DESIGN §3.3">
        <TypeSteps samples={copy.steps} />
      </Section>
      <Section id="space" title="Space and layout, DESIGN §3.4">
        <Spacing />
      </Section>
      <Section id="shape" title="Shape and depth, DESIGN §3.5 and §3.7">
        <Shapes />
      </Section>
      <Section id="motion" title="Durations, curves and springs, DESIGN §4.2 and §4.3">
        <MotionTokens />
      </Section>
      <Section id="scroll" title="The scroll scrub and Motion's features, DESIGN §4.4 and SRS §11.8">
        <ScrubDemo unit={copy.millimetres} />
        <SpringDemo label={copy.move} />
      </Section>
      <Section id="transparency" title="The placard, DESIGN §4.5">
        <Placard sample={copy.steps.lead} />
      </Section>
      <Section id="components" title="Base controls, DESIGN §6.1 and §6.4">
        <Demos copy={copy} />
      </Section>
      <Section id="tokens" title="Every custom property the stylesheets declare">
        <TokenList />
      </Section>
    </SpecimenPage>
  );
}
