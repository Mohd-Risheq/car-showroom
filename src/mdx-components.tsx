import type { MDXComponents } from "mdx/types";
import type { ComponentProps } from "react";
import { DataTable } from "@/components/ui/data-table";
import { ReadingHeading } from "@/components/ui/reading-heading";

// The elements of the site's MDX pages (SCR-14), which Next.js requires to compile MDX in the App
// Router. A page renders its own h1 and an MDX file starts at h2, so each page has one h1 (DESIGN
// §8.1). The MDX files carry no class names: every class is here in src, where Tailwind looks for
// them.

const components = {
  h2: ReadingHeading,
  p: (props: ComponentProps<"p">) => <p {...props} className="mt-4" />,
  ul: (props: ComponentProps<"ul">) => <ul {...props} className="mt-4 flex list-disc flex-col gap-2 ps-6" />,
  DataTable,
} satisfies MDXComponents;

export function useMDXComponents(): MDXComponents {
  return components;
}
