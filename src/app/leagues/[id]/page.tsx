import { redirect } from "next/navigation";

// Picks and Standings used to share this route, switched by ?tab=. It stays
// as a redirect so bookmarks, notifications and old links still land.
export default async function LeagueRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { tab, ...rest } = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    for (const v of [value ?? []].flat()) query.append(key, v);
  }
  const target = tab === "standings" ? "standings" : "picks";
  const qs = query.toString();
  redirect(`/leagues/${id}/${target}${qs ? `?${qs}` : ""}`);
}
