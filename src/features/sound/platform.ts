/**
 * FR-15.12: iOS and iPadOS, where the silent switch can mute the clip and no API reports it.
 * iPadOS reports a Mac user agent, so a Mac with more than one touch point counts too.
 */
export function needsSilentHint(userAgent: string, maxTouchPoints: number): boolean {
  if (/\b(?:iPhone|iPad|iPod)\b/.test(userAgent)) return true;
  return /\bMacintosh\b/.test(userAgent) && maxTouchPoints > 1;
}
