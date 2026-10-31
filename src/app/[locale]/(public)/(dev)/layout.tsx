import { LocaleOffer } from "@/components/ui/locale-offer";
import { notFoundOnDeployments } from "@/lib/deployment";

// The development pages, outside the site's shell. They keep the English offer, which
// /[locale]/dev/locale checks (FR-01.2a), first in reading order as it was before the shell.
export default function PublicDevLayout({ children }: LayoutProps<"/[locale]">) {
  notFoundOnDeployments();
  return (
    <>
      <LocaleOffer />
      {children}
    </>
  );
}
