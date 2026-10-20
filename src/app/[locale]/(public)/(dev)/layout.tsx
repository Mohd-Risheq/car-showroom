import { notFoundOnDeployments } from "@/lib/deployment";

export default function PublicDevLayout({ children }: LayoutProps<"/[locale]">) {
  notFoundOnDeployments();
  return children;
}
