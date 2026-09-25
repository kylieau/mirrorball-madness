"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "cn";

export function ScrollFade({
  className,
  outerClassName,
  children,
}: {
  className?: string;
  outerClassName?: string;
  children: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(false);

  function measure() {
    const el = scroller.current;
    if (el) setHasMore(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }

  // Runs after every render so a refreshed list re-checks whether it overflows.
  useEffect(measure);

  return (
    <div className={cn("relative", outerClassName)}>
      <div ref={scroller} onScroll={measure} className={cn("overflow-y-auto", className)}>
        {children}
      </div>
      {hasMore && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent"
        />
      )}
    </div>
  );
}
