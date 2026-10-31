"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Component, Suspense, useEffect, useState } from "react";
import { PlaceKeeper } from "./place-keeper";

// FR-02.5: a step back or forward returns to where its page was, and a new page starts at its top.
// place-keeper.ts keeps each history entry's place and puts it back; this runs it with the shell.

export function ScrollMemory() {
  return (
    <Suspense fallback={null}>
      <PlaceKeeping />
    </Suspense>
  );
}

function PlaceKeeping() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [keeper] = useState(() => new PlaceKeeper(pathname, search));
  useEffect(() => keeper.start(), [keeper]);

  return <PageChange keeper={keeper} pathname={pathname} search={search} />;
}

type PageChangeProps = { keeper: PlaceKeeper; pathname: string; search: string };

/**
 * Tells the keeper of each page React commits. getSnapshotBeforeUpdate, React's one hook that runs
 * before the page on screen changes, notes the place of the page leaving, which a step can no longer
 * read once React has rendered the next page inside popstate, though the browser may not have told
 * of the last scroll yet. componentDidUpdate sends the new page, or the page a step back or forward
 * has rendered, to its place before it paints.
 */
class PageChange extends Component<PageChangeProps> {
  getSnapshotBeforeUpdate(): null {
    this.props.keeper.leave();
    return null;
  }

  componentDidUpdate(): void {
    const { keeper, pathname, search } = this.props;
    keeper.arrive(pathname, search);
  }

  render(): null {
    return null;
  }
}
