"use client";

import { createContext, type ReactNode, use } from "react";

// The few words a client part of the shell shows that no server component can hand it as props: a
// segment's error boundary, which Next.js renders with only the error and a retry. The shell's
// layout provides them from the catalogs, so the browser formats no messages (D-041).

export type ShellStrings = {
  /** errors.segment */
  segmentError: string;
  /** common.retry */
  retry: string;
};

const Strings = createContext<ShellStrings | null>(null);

export function ShellStringsProvider({ value, children }: { value: ShellStrings; children: ReactNode }) {
  return <Strings value={value}>{children}</Strings>;
}

/** The shell's strings; only inside the public shell's layout */
export function useShellStrings(): ShellStrings {
  const strings = use(Strings);
  if (strings === null) throw new Error("useShellStrings needs the public shell's layout around it");
  return strings;
}
