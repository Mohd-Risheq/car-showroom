import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { SPECIMEN_COPY } from "@/app/_dev/specimen/copy";
import { Demos } from "@/app/_dev/specimen/demos";
import { Section, Shapes, Spacing, Swatches, WorkspaceType } from "@/app/_dev/specimen/sections";
import { SpecimenPage } from "@/app/_dev/specimen/specimen-page";
import { ThemeSwitch } from "@/app/_dev/specimen/theme-switch";
import { TokenList } from "@/app/_dev/specimen/token-list";
import { notFoundOnDeployments } from "@/lib/deployment";

// T-13: the dealer workspace's tokens in Daylight and dark (DESIGN §3.2), its fixed type scale, the
// base controls on them, and every custom property the stylesheets declare. Motion and the placard
// are the public site's, on /dev/tokens.

export const metadata: Metadata = { title: "Muftah dev: tokens, dealer workspace" };

export default async function DealerTokensPage() {
  notFoundOnDeployments();
  const locale = await getLocale();
  const copy = SPECIMEN_COPY[locale];

  return (
    <SpecimenPage title="Muftah dev: tokens, dealer workspace (T-13)" locale={locale} path="/dealer/dev/tokens">
      <ThemeSwitch label={copy.theme} names={{ daylight: copy.daylight, dark: copy.dark }} />
      <Section id="colour" title="Colour in the active theme, DESIGN §3.2">
        <Swatches />
      </Section>
      <Section id="type" title="The workspace's fixed scale, DESIGN §3.3">
        <WorkspaceType sample={copy.steps.body} />
      </Section>
      <Section id="space" title="Space and layout, DESIGN §3.4">
        <Spacing />
      </Section>
      <Section id="shape" title="Shape and depth, DESIGN §3.5 and §3.7">
        <Shapes />
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
