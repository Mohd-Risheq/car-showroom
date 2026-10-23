"use client";

import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "@phosphor-icons/react/ssr";
import {
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/class-names";
import { Button } from "./button";
import { releaseVelocity, rubberBand, type Sample, shouldDismiss } from "./sheet-gesture";
import { type Input, inputOf, SheetMotion } from "./sheet-motion";

// DESIGN §6.1's draggable bottom sheet. Base UI's Dialog traps focus, locks the page's scroll, makes
// the page behind inert, and closes the sheet on Escape and on a tap outside it. A drag of the header
// moves the sheet, even mid-flight, and a flick down or a drag past half its height closes it
// (sheet-gesture.ts); sheet-motion.ts moves it. Its visible title takes focus on open, and its close
// button lets a screen reader on a touch screen leave it (DESIGN §8.1 and §8.4).

/** The page margin plus the home indicator's safe area, under the sheet's last block */
const SAFE_BOTTOM = "pb-[calc(var(--spacing-page)+env(safe-area-inset-bottom))]";

type BottomSheetProps = {
  open: boolean;
  /**
   * Called when the trigger opens the sheet or the person closes it. Set `open` to match: the sheet
   * leaves whenever `open` turns false, as it should after a navigation.
   */
  onOpenChange: (open: boolean) => void;
  /** The button that opens the sheet, which gets the ARIA state that goes with it */
  trigger?: ReactElement;
  title: ReactNode;
  /** The close button's name, from the catalogs */
  closeLabel: string;
  /** Pinned under the content, as the filter sheet's "Show N cars" */
  footer?: ReactNode;
  children: ReactNode;
};

type Drag = { pointer: number; start: number; origin: number; height: number; samples: Sample[] };

export function BottomSheet({ open, onOpenChange, trigger, title, closeLabel, footer, children }: BottomSheetProps) {
  const actions = useRef<Dialog.Root.Actions>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const lastInputRef = useLastInput();
  const drag = useRef<Drag | null>(null);
  /** The velocity of the release that closed the sheet, which its way out keeps */
  const release = useRef<number | undefined>(undefined);
  // One SheetMotion per mounted sheet: it knows where the sheet is between animations
  const [motion, setMotion] = useState<SheetMotion | null>(null);
  const sheet = useCallback((element: HTMLDivElement | null) => {
    setMotion(element ? new SheetMotion(element, backdrop) : null);
  }, []);

  useLayoutEffect(() => {
    if (!motion) return;
    if (open) {
      motion.open(lastInputRef.current);
    } else {
      // A drag the close interrupts ends with it: its release would bring the sheet back, and the
      // header that would hear it may already be gone
      drag.current = null;
      motion.close(lastInputRef.current, release.current);
      release.current = undefined;
    }
  }, [motion, open, lastInputRef]);

  function onChange(next: boolean, details: Dialog.Root.ChangeEventDetails) {
    // The event tells its input even before useLastInput's listeners are on, as when a key opens the
    // sheet while the page is still hydrating
    lastInputRef.current = inputOf(details) ?? lastInputRef.current;
    onOpenChange(next);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    // One finger or the main button; a press on the close button stays a press
    if (!motion || !open || drag.current || !event.isPrimary || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = motion.grab();
    drag.current = {
      pointer: event.pointerId,
      start: event.clientY,
      origin,
      height: motion.height,
      samples: [{ time: event.timeStamp, offset: origin }],
    };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!motion || current?.pointer !== event.pointerId) return;
    const distance = current.origin + event.clientY - current.start;
    // Above its open position the sheet gives less the further it is pulled
    const offset = distance < 0 ? -rubberBand(-distance, current.height) : distance;
    motion.drag(offset);
    current.samples.push({ time: event.timeStamp, offset });
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!motion || current?.pointer !== event.pointerId) return;
    drag.current = null;
    const offset = current.samples.at(-1)?.offset ?? current.origin;
    // A cancelled pointer only puts the sheet back
    const velocity = event.type === "pointerup" ? releaseVelocity(current.samples, event.timeStamp) : 0;
    if (event.type === "pointerup" && shouldDismiss({ offset, velocity, height: current.height })) {
      release.current = velocity;
      actions.current?.close();
    } else {
      motion.settle(velocity);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onChange} actionsRef={actions}>
      {trigger ? <Dialog.Trigger render={trigger} /> : null}
      <Dialog.Portal>
        <Dialog.Backdrop ref={backdrop} className="fixed inset-0 z-50 bg-bg/60 data-closed:pointer-events-none" />
        <Dialog.Popup
          ref={sheet}
          // DESIGN §8.1: sheets are modal dialogs, which Base UI doesn't announce on its own
          aria-modal="true"
          initialFocus={heading}
          // The sheet's colour continues below it, for the overshoot and the pull above its place
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[calc(100dvh-(--spacing(12)))] flex-col bg-surface-2 shadow-overlay surface-edge after:absolute after:inset-x-0 after:top-full after:h-dvh after:bg-inherit data-closed:pointer-events-none"
        >
          <div
            className="shrink-0 touch-pan-x px-page select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-line" />
            <div className="flex items-center justify-between gap-4 py-2">
              <Dialog.Title ref={heading} tabIndex={-1} className="text-lg font-semibold public:type-lead">
                {title}
              </Dialog.Title>
              <Dialog.Close
                render={
                  <Button variant="quiet" size="icon" aria-label={closeLabel}>
                    <XIcon />
                  </Button>
                }
              />
            </div>
          </div>
          <div
            className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-page", footer ? "pb-4" : SAFE_BOTTOM)}
          >
            {children}
          </div>
          {footer ? <div className={cn("shrink-0 px-page pt-4", SAFE_BOTTOM)}>{footer}</div> : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Whether the last input was a key or a pointer: a keyboard-driven change is instant (DESIGN §4.2).
 * Base UI's own changes say theirs (inputOf); this covers the rest, such as a drag's release.
 */
function useLastInput(): RefObject<Input> {
  const last = useRef<Input>("pointer");
  useEffect(() => {
    const onKey = () => {
      last.current = "keyboard";
    };
    const onPointer = () => {
      last.current = "pointer";
    };
    // Captured, so a handler that stops the event can't hide it
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);
  return last;
}
