"use client";

import { ThemeProvider } from "next-themes";
import { type ReactNode, useEffect } from "react";

// DESIGN §3.2: the dealer workspace opens in Daylight, for sunlit lots, and offers the dark theme
// (the public tokens). next-themes keeps the choice in this browser and puts it on <html> as
// data-theme, where tokens.css reads it (D-037). On a document load its inline script does that
// before the page paints. A client-side change of locale builds the root layout again: React puts
// back <html>'s attributes as the layout renders them, and next-themes sets the theme again a frame
// later (D-038). Only the dealer layout mounts this: the public site is dark only.

export const WORKSPACE_THEMES = ["daylight", "dark"] as const;

type WorkspaceThemeProps = {
  /** The request's CSP nonce, for next-themes' inline script (SRS §12.5) */
  nonce: string | undefined;
  children: ReactNode;
};

export function WorkspaceTheme({ nonce, children }: WorkspaceThemeProps) {
  return (
    <ThemeProvider
      attribute="data-theme"
      themes={[...WORKSPACE_THEMES]}
      defaultTheme="daylight"
      enableSystem={false}
      // tokens.css sets color-scheme with each theme's colours
      enableColorScheme={false}
      disableTransitionOnChange
      storageKey="muftah-workspace-theme"
      {...(nonce ? { nonce } : {})}
    >
      <ThemeColor />
      {children}
    </ThemeProvider>
  );
}

/**
 * Keeps the browser's theme colour on the active theme's --bg (DESIGN §3.2). It watches the
 * attribute rather than next-themes' state, which changes before the attribute does, and <head>:
 * Next.js replaces the theme-color meta on every navigation with one in the layout's Daylight colour.
 */
function ThemeColor() {
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      const colour = getComputedStyle(root).getPropertyValue("--bg").trim();
      for (const meta of document.head.querySelectorAll('meta[name="theme-color"]')) {
        // Only when it differs, as setting it is a change this observer sees
        if (meta.getAttribute("content") !== colour) meta.setAttribute("content", colour);
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    observer.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ["content"] });
    return () => observer.disconnect();
  }, []);
  return null;
}
