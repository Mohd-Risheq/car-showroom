"use client";

import { MoonIcon, SunIcon } from "@phosphor-icons/react/ssr";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { noChanges } from "@/app/_dev/harness";
import { Button } from "@/components/ui/button";
import { WORKSPACE_THEMES } from "@/components/ui/workspace-theme";

// The workspace's two themes (DESIGN §3.2), switched as the dealer's settings will switch them, so the
// specimen shows each token in both

type Theme = (typeof WORKSPACE_THEMES)[number];

const ICONS = { daylight: <SunIcon />, dark: <MoonIcon /> } satisfies Record<Theme, unknown>;

type ThemeSwitchProps = {
  /** The group's name */
  label: string;
  /** Each theme's name */
  names: Record<Theme, string>;
};

export function ThemeSwitch({ label, names }: ThemeSwitchProps) {
  const { theme, setTheme } = useTheme();
  // The stored theme is known only in the browser, so the server renders neither as pressed
  const hydrated = useSyncExternalStore(
    noChanges,
    () => true,
    () => false,
  );

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-3">
      {WORKSPACE_THEMES.map((name) => (
        <Button
          key={name}
          icon={ICONS[name]}
          aria-pressed={hydrated ? theme === name : undefined}
          className="aria-pressed:bg-surface-3"
          onClick={() => setTheme(name)}
        >
          {names[name]}
        </Button>
      ))}
    </div>
  );
}
