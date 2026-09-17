"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { setSpoilerFreeMode as setSpoilerFreeModeForUser } from "@/lib/spoiler-mode";

export async function setSpoilerFreeMode(enabled: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not signed in" };
  }

  const result = await setSpoilerFreeModeForUser(supabase, user.id, enabled);
  if (result.error) return result;

  revalidatePath("/", "layout");
  return { error: null };
}
