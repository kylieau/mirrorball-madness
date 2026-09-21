"use client";

import { useEffect, useRef, type ReactNode } from "react";

export const STICKY_HEADER_HEIGHT_VAR = "--sticky-header-h";

// Pins the top bar + page title (+ switcher/carousel) for the fan tabs. Must be
// a direct child of the page container so it stays stuck for the whole scroll.
// Publishes its height so other sticky chrome (Home's curtain bar) can sit
// directly beneath it instead of sliding under.
export function StickyPageHeader({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(STICKY_HEADER_HEIGHT_VAR, `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty(STICKY_HEADER_HEIGHT_VAR);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="sticky top-0 z-40 -mx-4 flex flex-col gap-3 border-b border-border bg-background px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]"
    >
      {children}
    </div>
  );
}
