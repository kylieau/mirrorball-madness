// Read-only check of the waiver runs: what each Recast league's next run
// will act on before it is due, and what the run did afterwards. Prints ids
// and counts only, never a manager's or couple's name. Run from the project
// root:
//
//   NODE_OPTIONS=--experimental-websocket npx tsx --env-file=.env.local scripts/recast-run-check.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Missing Supabase env (run with --env-file=.env.local)");
const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

const short = (id: string) => id.slice(0, 8);
const count = (rows: Record<string, unknown>[], key: string) =>
  rows.reduce<Record<string, number>>((acc, row) => {
    const value = String(row[key] ?? "null");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});

async function main() {
  const { data: overdue, error: overdueError } = await admin.rpc("recast_runs_overdue");
  if (overdueError) throw overdueError;
  console.log("Overdue runs (should be empty):", overdue.length ? overdue : "none");

  const { data: leagues, error: leaguesError } = await admin
    .from("leagues")
    .select("id, name, trades_enabled, recast_on_since")
    .or("recast_on_since.not.is.null,trades_enabled.eq.true")
    .order("name");
  if (leaguesError) throw leaguesError;

  for (const league of leagues) {
    const tag = short(league.id);
    const [{ data: next }, { data: cycles }, { data: claims }, { data: offers }] = await Promise.all([
      admin.rpc("recast_next_cycle", { p_league_id: league.id }),
      admin.from("recast_cycles").select("week_number, start_week, awards, trades, processed_at").eq("league_id", league.id).order("week_number"),
      admin.from("waiver_claims").select("status, result, week_number, drop_couple_id").eq("league_id", league.id),
      admin.from("trade_offers").select("status, result, week_number, veto_ends_at, expires_at").eq("league_id", league.id),
    ]);
    const upcoming = next?.[0];
    const pending = (claims ?? []).filter((c) => c.status === "pending");
    console.log(`\n${tag}  recast ${league.recast_on_since ? "on" : "off"}, trades ${league.trades_enabled ? "on" : "off"}`);
    console.log(
      "  next run:",
      upcoming
        ? `Week ${upcoming.week_number}, due ${upcoming.due_at ?? "after results"}, claims start Week ${upcoming.start_week}`
        : "none to come",
    );
    console.log("  runs done:", cycles?.length ? cycles : "none");
    console.log("  pending claims:", pending.length, pending.length ? `(${pending.filter((c) => c.drop_couple_id).length} with a drop)` : "");
    console.log("  claim results:", count((claims ?? []).filter((c) => c.status !== "pending"), "result"));
    console.log("  offers by status:", count(offers ?? [], "status"));
    if (upcoming?.due_at) {
      const dueAt = new Date(upcoming.due_at);
      const waiting = (offers ?? []).filter((o) => o.status === "accepted" && o.veto_ends_at && new Date(o.veto_ends_at) > dueAt).length;
      if (waiting) console.log(`  accepted trades whose veto window outlasts the run (they wait for the next one): ${waiting}`);
    }
  }

  // A won claim or an executed trade opens a roster row at the run's start week,
  // so the latest start week per league shows whether anything moved.
  for (const league of leagues) {
    const { data: rows } = await admin
      .from("roster_slots")
      .select("start_week")
      .eq("league_id", league.id)
      .is("end_week", null)
      .order("start_week", { ascending: false })
      .limit(1);
    const latest = rows?.[0]?.start_week;
    if (latest === undefined) continue;
    const { count: moved } = await admin
      .from("roster_slots")
      .select("id", { count: "exact", head: true })
      .eq("league_id", league.id)
      .eq("start_week", latest)
      .is("end_week", null);
    console.log(`${short(league.id)}  latest open roster rows start Week ${latest}: ${moved ?? "?"} rows`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
