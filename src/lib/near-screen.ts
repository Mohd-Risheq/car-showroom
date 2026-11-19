// FR-09.7's "within one viewport of the screen": how near the screen a lazy part's place comes before
// the part loads its code, above or below it. An IntersectionObserver's rootMargin takes a
// percentage of the viewport's height for its top and bottom.

/** An observer's rootMargin for a place within one viewport above or below the screen */
export const NEAR_SCREEN_MARGIN = "100% 0px";
