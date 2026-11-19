// DESIGN §9.5: figures as they are written, as a year, a count or a reference: left to right in an
// isolate of their own, so they read the same in Arabic, in Martian Mono (§3.3). A number with a
// unit is Quantity's.

export function Figures({ children }: { children: string }) {
  return (
    <bdi dir="ltr" className="figures">
      {children}
    </bdi>
  );
}
