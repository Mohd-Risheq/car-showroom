import type { ReactNode } from "react";

/** A token's or a demo's name, in the specimens' development chrome: English, in the system monospace */
export function Caption({ children }: { children: ReactNode }) {
  return (
    <span lang="en" dir="ltr" className="font-mono text-xs">
      {children}
    </span>
  );
}
