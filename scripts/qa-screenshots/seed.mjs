// Creates (or removes) a scratch league full of worst-case data for the
// screenshot pass: throwaway accounts with very long and one-letter display
// names, a co-managed team, a long league name, a completed draft and one
// Curtain Call pick. Everything lives only in that league, so real leagues
// never see it. Run from the project root:
//
//   NODE_OPTIONS=--experimental-websocket node --env-file=.env.local scripts/qa-screenshots/seed.mjs up
//   NODE_OPTIONS=--experimental-websocket node --env-file=.env.local scripts/qa-screenshots/seed.mjs down
//
// `up` writes .qa-state.json (gitignored) next to this file; `down` reads it,
// deletes the league through delete_league and removes the auth users.
import { readFile, writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const STATE_FILE = new URL("./.qa-state.json", import.meta.url);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Missing Supabase env (run with --env-file=.env.local)");

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const LEAGUE_NAME = "Carrie Ann's Unbelievably Long Ballroom Dynasty Supercalifragilisticexpialidocious";
const PEOPLE = [
  { key: "viewer", displayName: "Alexandria Ocasio-Whittaker-Ribeiro" },
  { key: "coManager", displayName: "Christopher Montgomery-Fitzgerald" },
  { key: "one", displayName: "X" },
  { key: "long", displayName: "MaximilianBartholomewVonRichthofenSmythe" },
];

async function signIn(email, password) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function rpc(client, fn, args) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

async function up() {
  const password = `Qa-${randomUUID()}`;
  const users = {};
  for (const person of PEOPLE) {
    const email = `qa-${person.key}-${randomUUID().slice(0, 8)}@mirrorball-test.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: person.displayName },
    });
    if (error) throw error;
    users[person.key] = { id: data.user.id, email, password, displayName: person.displayName };
  }
  await writeFile(STATE_FILE, JSON.stringify({ users, password }, null, 2));

  const viewer = await signIn(users.viewer.email, password);
  const league = await rpc(viewer, "create_league", { p_name: LEAGUE_NAME });
  await writeFile(STATE_FILE, JSON.stringify({ users, password, leagueId: league.id }, null, 2));

  const one = await signIn(users.one.email, password);
  const long = await signIn(users.long.email, password);
  await rpc(one, "join_league", { p_invite_code: league.invite_code });
  await rpc(long, "join_league", { p_invite_code: league.invite_code });

  const coCode = await rpc(viewer, "generate_co_manager_invite_code", { p_league_id: league.id });
  const coManager = await signIn(users.coManager.email, password);
  await rpc(coManager, "join_as_co_manager", { p_code: coCode });

  await rpc(viewer, "set_draft_order", {
    p_league_id: league.id,
    p_ordered_user_ids: [users.viewer.id, users.one.id, users.long.id],
  });
  await rpc(viewer, "start_draft", { p_league_id: league.id });
  for (const client of [viewer, one, long]) {
    await rpc(client, "set_draft_autopilot", { p_league_id: league.id, p_enabled: true });
  }
  for (let i = 0; i < 40; i++) {
    const { data } = await admin.from("leagues").select("draft_status").eq("id", league.id).single();
    if (data.draft_status === "completed") break;
    await rpc(viewer, "make_auto_draft_pick", { p_league_id: league.id });
  }

  const { data: season } = await admin.from("seasons").select("id").eq("is_active", true).single();
  const { data: week } = await admin
    .from("competition_weeks")
    .select("id, week_number, is_double_elimination_week")
    .eq("season_id", season.id)
    .gte("week_number", 1)
    .order("week_number");
  const { data: episodes } = await admin
    .from("episodes")
    .select("week_id, results_published_at")
    .eq("season_id", season.id);
  const published = new Set(episodes.filter((e) => e.results_published_at).map((e) => e.week_id));
  const nextWeek = week.find((w) => !published.has(w.id));
  const { data: couples } = await admin
    .from("couples")
    .select("id")
    .eq("season_id", season.id)
    .eq("status", "active")
    .limit(3);
  if (nextWeek && couples.length >= 3) {
    await rpc(viewer, "submit_prediction", {
      p_league_id: league.id,
      p_week_id: nextWeek.id,
      p_predicted_eliminated_couple_id: couples[0].id,
      p_predicted_eliminated_couple_id_2: nextWeek.is_double_elimination_week ? couples[1].id : null,
      p_predicted_top_scorer_couple_id: couples[2].id,
    });
  }

  console.log(`League ${league.id} ready. Viewer: ${users.viewer.email}`);
}

async function down() {
  const state = JSON.parse(await readFile(STATE_FILE, "utf8"));
  if (state.leagueId) {
    const viewer = await signIn(state.users.viewer.email, state.password);
    await rpc(viewer, "delete_league", { p_league_id: state.leagueId });
  }
  for (const user of Object.values(state.users)) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) console.error(`deleteUser ${user.email}: ${error.message}`);
  }
  await rm(STATE_FILE);
  console.log("Scratch league and users removed.");
}

const command = process.argv[2];
if (command === "up") await up();
else if (command === "down") await down();
else throw new Error("Usage: seed.mjs up|down");
