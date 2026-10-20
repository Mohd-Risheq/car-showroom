import { notFoundOnDeployments } from "@/lib/dev-only";

export default function PublicDevLayout({ children }: LayoutProps<"/[locale]">) {
  notFoundOnDeployments();
  return children;
}
