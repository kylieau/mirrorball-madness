import { BOTTOM_NAV_CLEARANCE, BottomNav, BOTTOM_NAV_TABS_CLASS } from "@/components/bottom-nav";

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className}`} aria-hidden />;
}

// Shown by each fan tab's loading.tsx so a tap paints immediately instead of
// waiting on the server's queries. The tab bar is placeholder blocks because
// the real links need the league id the page is still loading.
export function FanPageSkeleton() {
  return (
    <div className="flex flex-col px-4" role="status" aria-label="Loading">
      <div className={`flex flex-col gap-4 py-8 ${BOTTOM_NAV_CLEARANCE}`}>
        <Block className="h-8 w-40" />
        <Block className="h-28 w-full" />
        <Block className="h-44 w-full" />
        <Block className="h-44 w-full" />
      </div>
      <BottomNav>
        <div className={BOTTOM_NAV_TABS_CLASS}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex min-h-11 flex-1 items-center justify-center">
              <Block className="h-6 w-12" />
            </div>
          ))}
        </div>
      </BottomNav>
    </div>
  );
}
