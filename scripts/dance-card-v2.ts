// Switches a league's Dance Card between v1 and v2 (docs/design/dance-card-v2/),
// rebuilds a v2 league in place, or checks one, against live data. Run from
// the project root:
//
//   NODE_OPTIONS=--experimental-websocket npx tsx --env-file=.env.local scripts/dance-card-v2.ts --dry-run
//   ... --apply --league <id> --actor <site admin profile id>
//   ... --rollback --league <id> --actor <id>
//   ... --refresh --league <id> --actor <id>
//   ... --verify
//
// --dry-run and --verify only read. Before apply-dance-card-v2.sql is live the
// dry run assembles the same snapshot from the tables; every write needs the
// SQL, because set_dance_card_points checks its revision.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "../src/lib/supabase/types";
import { danceCardDifferences, danceCardRowsFromLive, type DanceCardSnapshot } from "../src/lib/dance-card-refresh";
import { danceCardLedger, danceCardRule } from "../src/lib/dance-card-v2";
import { danceCardPriorWeeks } from "../src/lib/weekly-score-rows";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Missing Supabase env (run with --env-file=.env.local)");
const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

async function all<T>(table: keyof Database["public"]["Tables"]): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select("*").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (data.length < 1000) return rows;
  }
}

async function loadSnapshot(readOnly: boolean): Promise<DanceCardSnapshot> {
  const { data, error } = await admin.rpc("dance_card_snapshot");
  if (!error) return data as unknown as DanceCardSnapshot;
  if (!readOnly) throw new Error(`dance_card_snapshot: ${error.message}. Apply apply-dance-card-v2.sql first.`);
  const season = (await all<DanceCardSnapshot["season"] & { is_active: boolean }>("seasons")).find((s) => s.is_active) ?? null;
  if (!season) throw new Error("No active season");
  const episodes = (await all<DanceCardSnapshot["episodes"][number]>("episodes")).filter((e) => e.season_id === season.id);
  const weeks = (await all<DanceCardSnapshot["weeks"][number]>("competition_weeks")).filter((w) => w.season_id === season.id);
  const episodeIds = new Set(episodes.map((e) => e.id));
  const weekIds = new Set(weeks.map((w) => w.id));
  return {
    season,
    episodes,
    weeks,
    couples: (await all<DanceCardSnapshot["couples"][number]>("couples")).filter((c) => c.season_id === season.id),
    dances: (await all<DanceCardSnapshot["dances"][number]>("dance_scores")).filter((d) => episodeIds.has(d.episode_id)),
    outcomes: (await all<DanceCardSnapshot["outcomes"][number]>("episode_results")).filter((o) => episodeIds.has(o.episode_id)),
    leagues: await all("leagues"),
    settings: (await all<DanceCardSnapshot["settings"][number]>("scoring_settings")).map((s) => ({ ...s, dance_card_version: s.dance_card_version ?? "v1" })),
    rosters: await all("roster_slots"),
    weeklyScores: (await all<DanceCardSnapshot["weeklyScores"][number]>("weekly_manager_scores")).filter((r) => weekIds.has(r.week_id)),
    _revision: "",
  };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

// Before/after per manager, the per-couple ledger, and the two gates every
// write depends on: a v1 rebuild matches what's stored, and only Dance Card
// and the total move.
async function report(snapshot: DanceCardSnapshot, leagueId: string) {
  const league = snapshot.leagues.find((l) => l.id === leagueId)!;
  const settings = snapshot.settings.find((s) => s.league_id === leagueId)!;
  const stored = snapshot.weeklyScores.filter((r) => r.league_id === leagueId);
  const current = settings.dance_card_version === "v2" ? "v2" : "v1";
  const rebuilt = danceCardDifferences(stored, danceCardRowsFromLive(snapshot, leagueId, current));
  const v2Rows = danceCardRowsFromLive(snapshot, leagueId, "v2");
  const { data: profiles } = await admin.from("profiles").select("id, display_name");
  const name = new Map((profiles ?? []).map((p) => [p.id, (p.display_name ?? "").trim()]));
  const managers = [...new Set(stored.map((r) => r.manager_id))];
  const sum = (rows: { manager_id: string; roster_points: number; total_points: number }[], id: string, key: "roster_points" | "total_points") =>
    round(rows.filter((r) => r.manager_id === id).reduce((s, r) => s + Number(r[key]), 0));
  const table = managers.map((id) => ({
    manager: name.get(id) ?? id,
    danceCardNow: sum(stored, id, "roster_points"),
    danceCardV2: sum(v2Rows, id, "roster_points"),
    totalNow: sum(stored, id, "total_points"),
    totalV2: sum(v2Rows, id, "total_points"),
  }));
  const rank = (key: "totalNow" | "totalV2", value: number) => 1 + table.filter((t) => t[key] > value).length;
  console.log(`\n== ${league.name} (${current}, weights DC×${settings.judges_score_category_weight} CC×${settings.eliminations_category_weight} GF×${settings.bonus_picks_category_weight})`);
  console.table(
    table
      .map((t) => ({ ...t, rankNow: rank("totalNow", t.totalNow), rankV2: rank("totalV2", t.totalV2), delta: round(t.totalV2 - t.totalNow) }))
      .sort((a, b) => a.rankNow - b.rankNow)
  );
  const rule = danceCardRule({ dance_card_version: "v2" }, league.roster_size);
  if (rule.version === "v2") {
    const lastWeek = Math.max(...snapshot.weeks.map((w) => w.week_number));
    const ledger = danceCardLedger(danceCardPriorWeeks(snapshot, lastWeek + 1), settings.judges_score_starts_week, rule);
    const people = new Map((await admin.from("people").select("id, name")).data?.map((p) => [p.id, p.name]) ?? []);
    const coupleName = new Map(snapshot.couples.map((c) => [c.id, (people.get(c.celebrity_id) ?? c.id).split(" ")[0]]));
    console.log(`k = ${rule.coefficient}, p = ${rule.exponent}; per couple: week input → cumulative → credit`);
    for (const [coupleId, entries] of ledger) {
      console.log(
        `  ${coupleName.get(coupleId)}: ` +
          [...entries].map(([w, e]) => `W${w} ${e.input}→${e.cumulative} +${(e.creditCents / 100).toFixed(2)}`).join(", ")
      );
    }
  }
  console.log(`Gate, ${current} rebuild equals stored: ${rebuilt.length === 0 ? "pass" : `FAIL (${rebuilt.length} rows)`}`);
  return { rebuildMatches: rebuilt.length === 0 };
}

async function write(leagueId: string, version: "v1" | "v2" | null) {
  const actor = option("actor");
  if (!actor) throw new Error("--actor <site admin profile id> is required");
  const snapshot = await loadSnapshot(false);
  const settings = snapshot.settings.find((s) => s.league_id === leagueId);
  if (!settings) throw new Error("League not found");
  const current = settings.dance_card_version === "v2" ? "v2" : "v1";
  if (version !== null) {
    const { rebuildMatches } = await report(snapshot, leagueId);
    if (!rebuildMatches) throw new Error(`Stored rows don't match a ${current} rebuild; nothing written`);
  }
  const rows = danceCardRowsFromLive(snapshot, leagueId, version ?? "v2");
  const { data, error } = await admin.rpc("set_dance_card_points", {
    p_actor_id: actor,
    p_league_id: leagueId,
    p_revision: snapshot._revision,
    // Null means "rebuild in place"; generated types can't express a null arg.
    p_version: version as string,
    p_migration_id: (version ? randomUUID() : null) as string,
    p_rows: rows as unknown as Json,
  });
  if (error) throw new Error(error.message);
  console.log(`Wrote ${data} rows${version ? `; league is now ${version}` : ""}.`);
}

async function main() {
  const leagueId = option("league");
  if (flag("apply") || flag("rollback") || flag("refresh")) {
    if (!leagueId) throw new Error("--league <id> is required");
    await write(leagueId, flag("apply") ? "v2" : flag("rollback") ? "v1" : null);
    return;
  }
  const snapshot = await loadSnapshot(true);
  const drafted = snapshot.leagues.filter((l) => snapshot.weeklyScores.some((r) => r.league_id === l.id));
  if (flag("verify")) {
    let failures = 0;
    for (const league of drafted) {
      const settings = snapshot.settings.find((s) => s.league_id === league.id)!;
      if (settings.dance_card_version !== "v2") continue;
      const differences = danceCardDifferences(snapshot.weeklyScores, danceCardRowsFromLive(snapshot, league.id, "v2"));
      failures += differences.length;
      console.log(`${league.name}: ${differences.length === 0 ? "matches" : `${differences.length} rows differ`}`);
    }
    if (failures > 0) process.exitCode = 1;
    return;
  }
  for (const league of drafted.filter((l) => !leagueId || l.id === leagueId)) await report(snapshot, league.id);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
