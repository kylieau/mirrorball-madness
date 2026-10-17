"use client";

import { startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

// reset() alone only re-renders the client tree; a server component that
// failed needs router.refresh() to fetch it again.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-24">
      <PageHeader title="Something Went Wrong" />
      <p className="text-sm text-muted-foreground">This page didn&apos;t load. Try again, or head back to Home.</p>
      <div className="flex gap-2">
        <Button size="lg" onClick={retry}>
          Try Again
        </Button>
        <Button render={<Link href="/" />} nativeButton={false} size="lg" variant="outline">
          Back to Home
        </Button>
      </div>
    </div>
  );
}
