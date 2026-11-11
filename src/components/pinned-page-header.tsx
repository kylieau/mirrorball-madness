"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/page-header";

// The fan tabs' pinned title block. It pins just below the phone's top inset,
// which a fixed cover paints in the page background so content never shows
// through the notch band. A zero-height marker, offset up by that inset so it
// sits where the block's top will be when pinned, leaves the viewport at the
// moment the block sticks, which is the only way CSS lets us know: while in
// flow the block shows `children` under the gold rule (the full week carousel
// on Results); once pinned it shows `pinnedTrailing` on the title row instead
// (the compact carousel), beside the always-present `trailing`.
export function PinnedPageHeader({
  title,
  trailing,
  pinnedTrailing,
  strip,
  children,
}: {
  title: string;
  trailing?: ReactNode;
  pinnedTrailing?: ReactNode;
  strip?: ReactNode;
  children?: ReactNode;
}) {
  const marker = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const swaps = Boolean(children || pinnedTrailing);

  useEffect(() => {
    if (!swaps || !marker.current) return;
    const observer = new IntersectionObserver(([entry]) => setPinned(!entry.isIntersecting), { threshold: 0 });
    observer.observe(marker.current);
    return () => observer.disconnect();
  }, [swaps]);

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-30 mx-auto h-[env(safe-area-inset-top)] max-w-(--frame-width) bg-background"
        aria-hidden
      />
      <div ref={marker} className="relative -top-[env(safe-area-inset-top)] -mb-px h-px" aria-hidden />
      <div className="sticky top-[env(safe-area-inset-top)] z-30 -mx-4 bg-background">
        <div className="px-4 py-2">
          <PageHeader
            title={title}
            trailing={
              trailing || (pinned && pinnedTrailing) ? (
                <>
                  {trailing}
                  {pinned && pinnedTrailing}
                </>
              ) : undefined
            }
          >
            {!pinned && children}
          </PageHeader>
        </div>
        {strip}
      </div>
    </>
  );
}
