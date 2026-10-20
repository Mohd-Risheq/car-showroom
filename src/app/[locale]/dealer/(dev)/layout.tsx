import { notFoundOnDeployments } from "@/lib/dev-only";

export default function DealerDevLayout({ children }: LayoutProps<"/[locale]/dealer">) {
  notFoundOnDeployments();
  return children;
}
