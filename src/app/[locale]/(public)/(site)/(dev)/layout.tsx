import { notFoundOnDeployments } from "@/lib/deployment";

// The development pages inside the site's shell (T-19), where the sticky header, the action bar and
// the focus moves are tried on pages of their own
export default function SiteDevLayout({ children }: LayoutProps<"/[locale]">) {
  notFoundOnDeployments();
  return children;
}
