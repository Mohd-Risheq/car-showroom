"use client";

// The lab's islands, in the one lazy chunk that holds the marker, so a test can tell when that chunk
// is requested: one that comes in, and one that throws as it renders, as an island with a bug would

export function IslandIn({ text }: { text: string }) {
  return (
    <p data-lab-island="muftah-section-lab-island" className="type-body">
      {text}
    </p>
  );
}

export function IslandThatThrows(): never {
  throw new Error("The section lab's island throws on purpose");
}
