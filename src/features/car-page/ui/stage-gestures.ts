import { type PointerEvent, useCallback, useState } from "react";
import { type PointerAt, type Stage, StageGesture } from "../domain/stage-gesture";
import { type Swipe, type SwipeEnd, SwipeGesture, type SwipeStage } from "../domain/swipe-gesture";
import type { Zoom } from "../domain/viewer";

// The fullscreen viewer's pointers on its stage (FR-10.3, FR-10.4): a pinch, a double tap and a
// drag of a zoomed photo zoom and pan it (stage-gesture.ts), and a finger's drag of a photo fitted
// whole swipes across or down (swipe-gesture.ts). A press of previous or next stays a press. A
// mouse takes its main button alone and pans a zoomed photo, but only a finger swipes.

type StageGesturesOptions = {
  /** What the gestures read of the stage, or null before it is measured */
  stage: Stage | null;
  /** The reading direction, and whether a photo waits each side, which a swipe reads too */
  around: Pick<SwipeStage, "dir" | "previous" | "next">;
  /** The zoom a gesture leads to: a release's glides, as a double tap's does */
  onZoom: (zoom: Zoom, glide: boolean) => void;
  /** Where a drag has the photos */
  onDrag: (drag: Swipe) => void;
  /** A finger landed on the photos, which sets any still settling where they were going */
  onLand: () => void;
  /** Where a released swipe takes the photos */
  onSettle: (end: SwipeEnd, stage: Stage) => void;
};

/** A pointer as the gestures read it: px from the stage's middle */
function pointerAt(event: PointerEvent<HTMLElement>): PointerAt {
  const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
  return {
    id: event.pointerId,
    x: event.clientX - left - width / 2,
    y: event.clientY - top - height / 2,
    time: event.timeStamp,
  };
}

/** The stage's pointer handlers, and the reset that lets go of every pointer */
export function useStageGestures({ stage, around, onZoom, onDrag, onLand, onSettle }: StageGesturesOptions) {
  const [gesture] = useState(() => new StageGesture());
  const [swipe] = useState(() => new SwipeGesture());
  const swipeStage = ({ zoom, screen }: Stage): SwipeStage => ({ zoom, screen, ...around });
  /** Lets go of every pointer: the viewer closed, a photo came in or the screen changed size */
  const reset = useCallback(() => {
    gesture.reset();
    swipe.reset();
  }, [gesture, swipe]);

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    // A press of previous or next stays a press, and a mouse takes its main button alone
    if (stage === null || (event.target instanceof Element && event.target.closest("button"))) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    onLand();
    const pointer = pointerAt(event);
    gesture.down(pointer, stage);
    // A swipe is a finger's: the mouse pans a zoomed photo alone
    const end = event.pointerType === "mouse" ? null : swipe.down(pointer, swipeStage(stage));
    if (end) onSettle(end, stage);
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    if (stage === null) return;
    const pointer = pointerAt(event);
    const to = gesture.move(pointer, stage);
    if (to) onZoom(to, false);
    const drag = swipe.move(pointer, swipeStage(stage));
    if (drag) onDrag(drag);
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    if (stage === null) return;
    const pointer = pointerAt(event);
    // A double tap glides, as a pinch that settles at 1x does
    const to = gesture.up(pointer, stage);
    if (to) onZoom(to, true);
    const end = swipe.up(pointer, swipeStage(stage));
    if (end) onSettle(end, stage);
  }

  /**
   * A pointer the browser took back, as for a gesture of its own: a swipe it held puts the photos
   * back
   */
  function onPointerLost(event: PointerEvent<HTMLElement>) {
    gesture.cancel(event.pointerId);
    const end = swipe.cancel(event.pointerId);
    if (end && stage) onSettle(end, stage);
  }

  return {
    reset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerLost,
      onLostPointerCapture: onPointerLost,
    },
  };
}
