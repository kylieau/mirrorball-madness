import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDefaultLandingPath } from "@/lib/default-landing";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(getDefaultLandingPath());
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Mirrorball Madness
      </h1>
      <p className="max-w-xl text-muted-foreground">
        Fantasy sports for Dancing with the Stars. Draft couples, run
        commissioner-owned leagues, and stay in the game all season with
        weekly Pick &apos;Em.
      </p>
    </div>
  );
}
