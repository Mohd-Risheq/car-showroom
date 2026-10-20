import { notFoundOnDeployments } from "@/lib/deployment";

export default function DealerDevLayout({ children }: LayoutProps<"/[locale]/dealer">) {
  notFoundOnDeployments();
  return children;
}
