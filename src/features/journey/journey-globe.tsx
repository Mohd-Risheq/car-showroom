"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import type { LatLng } from "./geo";
import type { JourneyGlobe as Globe, JourneyGlobeOptions } from "./globe";

// The Journey's globe slot (FR-17.5, FR-17.6). It shows the static map it is given, and swaps in
// the globe once the slot comes within one viewport of the screen, unless reduced motion is
// preferred or the browser has no WebGL. Only this file is in the page's bundle: the globe and
// cobe arrive as one lazy chunk.

type Props = {
  places: ReadonlyArray<LatLng | null>;
  active: number;
  /** The static map (StaticRouteMap), shown until the globe takes over and whenever it can't */
  children: ReactNode;
  onFrame?: JourneyGlobeOptions["onFrame"];
  onSettle?: JourneyGlobeOptions["onSettle"];
  /** Whether the globe or the static map is showing */
  onShow?: (globe: boolean) => void;
};

export function JourneyGlobe({ places, active, children, onFrame, onSettle, onShow }: Props) {
  const slot = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const globe = useRef<Globe | null>(null);
  const activeNow = useRef(active);
  const callbacks = useRef({ onFrame, onSettle, onShow });
  const [shown, setShown] = useState(false);

  useEffect(() => {
    callbacks.current = { onFrame, onSettle, onShow };
  });

  useEffect(() => {
    activeNow.current = active;
    globe.current?.activate(active);
  }, [active]);

  useEffect(() => {
    const element = slot.current;
    const target = host.current;
    if (!element || !target) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let near = false;
    let loading = false;
    let disposed = false;

    const show = (value: boolean) => {
      setShown(value);
      callbacks.current.onShow?.(value);
    };
    const unmount = () => {
      globe.current?.destroy();
      globe.current = null;
      show(false);
    };
    const mount = () => {
      if (!near || motion.matches || globe.current || loading) return;
      loading = true;
      import("./globe").then(
        ({ mountJourneyGlobe }) => {
          loading = false;
          if (disposed || !near || motion.matches || globe.current) return;
          try {
            globe.current = mountJourneyGlobe(target, {
              places,
              active: activeNow.current,
              onFail: unmount,
              onFrame: (cpuMs) => callbacks.current.onFrame?.(cpuMs),
              onSettle: () => callbacks.current.onSettle?.(),
            });
          } catch {
            // A globe that fails to start leaves the static map in place (FR-17 error states)
            target.replaceChildren();
            globe.current = null;
          }
          show(globe.current !== null);
        },
        () => {
          loading = false;
        },
      );
    };

    const observer = new IntersectionObserver(
      (entries) => {
        near = entries.some((entry) => entry.isIntersecting);
        mount();
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(element);
    const onMotion = () => (motion.matches ? unmount() : mount());
    motion.addEventListener("change", onMotion);
    return () => {
      disposed = true;
      observer.disconnect();
      motion.removeEventListener("change", onMotion);
      globe.current?.destroy();
      globe.current = null;
    };
  }, [places]);

  return (
    <div ref={slot} className="relative aspect-square w-full">
      <div ref={host} className="absolute inset-0" aria-hidden="true" />
      {shown ? null : <div className="absolute inset-0 flex items-center">{children}</div>}
    </div>
  );
}
