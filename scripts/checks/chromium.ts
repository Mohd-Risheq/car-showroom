// The flags of every Chromium this project launches: Playwright's projects, pnpm lhci and pnpm
// fonts:fallbacks. No run plays sound on the machine or opens its camera: the audio is muted, and a
// fake camera stands in, its permission prompt answered with no one there.
export const CHROMIUM_FLAGS: readonly string[] = [
  "--mute-audio",
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
];

/**
 * The flags of the Chromium LHCI starts for pnpm lhci. Playwright starts its Chromium without
 * Chromium's sandbox, and LHCI's launcher keeps it. On Linux the sandbox needs unprivileged user
 * namespaces, which Ubuntu since 23.10 refuses through AppArmor to a program it has no profile
 * for, and a container may not give either: in Playwright's Linux image, Chromium with its sandbox
 * aborts as it starts ("No usable sandbox!"), and on CI's ubuntu-24.04 runner it aborted the same
 * way, before Lighthouse loaded a page. Lighthouse only loads this site's own build, and elsewhere
 * Chromium keeps its sandbox.
 */
export function lighthouseChromeFlags(platform: NodeJS.Platform): readonly string[] {
  return platform === "linux" ? [...CHROMIUM_FLAGS, "--no-sandbox"] : CHROMIUM_FLAGS;
}
