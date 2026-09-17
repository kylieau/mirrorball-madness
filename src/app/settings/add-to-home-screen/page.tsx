import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddToHomeScreenNotice } from "@/components/add-to-home-screen-notice";
import { ADD_TO_HOME_SCREEN_COPY } from "@/lib/add-to-home-screen";
import { safeRelativePath } from "@/lib/safe-relative-path";

export default async function AddToHomeScreenPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const settingsHref = from
    ? `/settings?from=${encodeURIComponent(safeRelativePath(from, "/leagues"))}`
    : "/settings";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <Link href={settingsHref} className="text-sm text-muted-foreground hover:text-foreground">
        ‹ Settings
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{ADD_TO_HOME_SCREEN_COPY.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ADD_TO_HOME_SCREEN_COPY.detail}</p>
      </div>
      <AddToHomeScreenNotice />
    </div>
  );
}
