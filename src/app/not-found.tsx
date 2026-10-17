import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

export default function NotFound() {
  return (
    <div className="flex flex-col gap-3 px-4 py-24">
      <PageHeader title="Page Not Found" />
      <p className="text-sm text-muted-foreground">
        This link may be out of date, or the league may no longer exist.
      </p>
      <Button render={<Link href="/" />} nativeButton={false} size="lg" className="self-start">
        Back to Home
      </Button>
    </div>
  );
}
