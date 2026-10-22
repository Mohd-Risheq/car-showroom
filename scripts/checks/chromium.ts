// The flags of every Chromium this project launches: Playwright's projects, pnpm lhci and pnpm
// fonts:fallbacks. No run plays sound on the machine or opens its camera: the audio is muted, and a
// fake camera stands in, its permission prompt answered with no one there.
export const CHROMIUM_FLAGS: readonly string[] = [
  "--mute-audio",
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
];
