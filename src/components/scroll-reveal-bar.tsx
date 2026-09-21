"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";

export const STICKY_HEADER_HEIGHT_VAR = "--sticky-header-h";

// Renders `children` (the full page header) in normal flow and slides `bar`
// in as a slim sticky bar once that header has scrolled off the top — the same
// reveal Home's curtain bar uses. Must be a direct child of the page container
// so the sticky bar stays stuck for the whole scroll. While shown, it publishes
// its height so the curtain bar sits beneath it instead of under it.
export function ScrollRevealBar({
  bar,
  className,
  children,
}: {
  bar: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const headerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [scrolledPast, setScrolledPast] = useState(false);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) =>
      setScrolledPast(!entry.isIntersecting && entry.boundingClientRect.top < 0)
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = barRef.current;
    if (!scrolledPast || !el) return;
    const root = document.documentElement;
    root.style.setProperty(STICKY_HEADER_HEIGHT_VAR, `${el.offsetHeight}px`);
    return () => {
      root.style.removeProperty(STICKY_HEADER_HEIGHT_VAR);
    };
  }, [scrolledPast]);

  return (
    <>
      {/* Precedes the header: its sticky position is independent of where it sits, and the -mb-4 cancels its extra flex gap. */}
      <div className="sticky top-0 z-40 -mb-4 h-0">
        <div
          ref={barRef}
          inert={!scrolledPast}
          className={cn(
            "absolute -inset-x-4 top-0 border-b border-border bg-background pt-[env(safe-area-inset-top)] transition duration-200 motion-reduce:transition-none",
            scrolledPast ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
          )}
        >
          {bar}
        </div>
      </div>
      <div ref={headerRef} className={className}>
        {children}
      </div>
    </>
  );
}
