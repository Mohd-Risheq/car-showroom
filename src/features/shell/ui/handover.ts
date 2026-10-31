// A part of the 404's view hands what it had to the part taking its place in the same commit, as
// not-found.tsx's view takes the place of the server's once the page hydrates (D-047): the search's
// words, the keyboard's focus and the stage's crossing. React runs the cleanups of the parts it
// removes and then the effects of the parts it adds, in one go, so what is left and not taken by
// then, as when the visitor leaves the page, is dropped, and a later visit starts afresh.

/** What a part takes as it comes in, and how it leaves what it has as it goes */
export type Arrival<T> = {
  /** What the part this one takes the place of left on the same address, or null */
  taken: T | null;
  /** For the part's cleanup: leaves what it has, under the address it came in on */
  leave: (thing: T) => void;
};

/** A handover of one kind of thing, from a part on its way out to the part taking its place */
export function handover<T>(): { arrive: () => Arrival<T> } {
  let left: { address: string; thing: T } | null = null;
  return {
    arrive() {
      // Read as the part comes in: as it goes, the address may already be the next page's
      const address = window.location.pathname + window.location.search;
      const taken = left?.address === address ? left.thing : null;
      left = null;
      return {
        taken,
        leave(thing) {
          left = { address, thing };
          queueMicrotask(() => {
            left = null;
          });
        },
      };
    },
  };
}
