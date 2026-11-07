// Read-only service-role snapshot of the tables the analysis uses. Run from
// the project root (so @supabase/supabase-js resolves), and write the output
// outside the repository: it holds league members' display names.
//
//   NODE_OPTIONS=--experimental-websocket node docs/design/dance-card-v2/analysis/snapshot.mjs /private/path/snapshot.json
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const output = process.argv[2];
if (!output) throw new Error("Supply an output path outside the repository");
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
  })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const tables = {
  seasons: "*", competition_weeks: "*", episodes: "*", couples: "*",
  people: "id,name,role", dance_scores: "*", episode_results: "*", episode_teams: "*",
  leagues: "id,name,roster_size,draft_status,draft_scheduled_at,draft_type,waiver_mode,created_at,commissioner_id",
  scoring_settings: "*", league_members: "id,league_id,user_id,co_manager_id,role,draft_position,joined_at",
  roster_slots: "*", draft_picks: "*", weekly_manager_scores: "*", profiles: "id,display_name",
  waiver_claims: "*", episode_participants: "*", episode_in_jeopardy_couples: "*", judge_scores: "*",
  episode_rounds: "*",
};
const out = {};
for (const [table, columns] of Object.entries(tables)) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  out[table] = rows;
}
fs.writeFileSync(output, JSON.stringify(out));
