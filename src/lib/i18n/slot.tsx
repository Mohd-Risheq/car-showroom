import type { ReactNode } from "react";

// A message's values are text (next-intl), so markup that sits inside a sentence, such as a reference
// code in Martian Mono (DESIGN §9.5), goes in as SLOT, a private-use character that no catalog or
// dealer text holds, and fillSlot then puts the markup in its place.

/** The value a message takes where its markup goes */
export const SLOT = String.fromCodePoint(0xe000);

/** The message, written with SLOT as one of its values, with the markup in the slot's place */
export function fillSlot(message: string, markup: ReactNode): ReactNode {
  const [before, after, ...rest] = message.split(SLOT);
  if (after === undefined || rest.length > 0)
    throw new Error(`A message takes markup when it holds the slot once: ${message}`);
  return (
    <>
      {before}
      {markup}
      {after}
    </>
  );
}
