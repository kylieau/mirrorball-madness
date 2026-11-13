import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPublicationPlan, type LifelineInputs, type PublicationSnapshot } from "./episode-publication";

// The Trades fixture: a v3 league of four teams (two-couple rosters, Anchor
// Week 8) with its draft complete, Recast and Trades on. Week 8 sends F
// home. Weeks 8 and 9 are published, Week 10 airs in five days, so the
// effective week of a removal is 10.
//
// The race this SQL closes with deferred constraint triggers (a pick, claim
// or offer saved by a team removed before its transaction commits) needs two
// connections, which PGlite doesn't have; the trigger itself is exercised.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1), friend = id(2), third = id(3), partner = id(5), outsider = id(6), fourth = id(61);
const season = id(4), league = id(7), rumba = id(9);
const [week8, week9, week10, week11, week12] = [id(10), id(11), id(12), id(13), id(14)];
const [e09, e10, e11, e12, e13] = [id(15), id(16), id(17), id(18), id(19)];
const judges = [id(20), id(21), id(22)];
const [a, b, c, d, e, f, g, h, i, j] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => id(30 + n));

const LIVE_STACK = [
  "apply-audit-security", "apply-audit-deadlines", "apply-audit-settings", "apply-audit-prediction-provenance",
  "apply-curtain-call-backfill", "apply-curtain-call-backfill-lock-check", "apply-service-role-season-grants",
  "apply-drop-curtain-call-lock-guard", "apply-team-dance-entity", "apply-special-dances", "apply-special-dances-polish",
  "apply-draft-release-own-rows", "apply-whole-judge-marks", "apply-special-draft-release",
  "apply-contributor-special-setup", "apply-draft-lineup", "apply-retire-special-leftovers", "apply-episode-rounds",
  "apply-special-dance-label", "apply-dance-card-v2", "apply-dance-card-v3", "apply-lifeline", "apply-recast-v2",
  "apply-trades", "apply-recast-after-results", "apply-recast-dance-card-order", "apply-remove-manager",
  "apply-trade-execution",
];
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;`);
  await db.exec(
    readFileSync("supabase/schema.sql", "utf8")
      .replace('create extension if not exists "pgcrypto";', "")
      .replace(/alter publication supabase_realtime add table [^;]+;/g, "")
  );
  for (const file of LIVE_STACK) await db.exec(readFileSync(`supabase/${file}.sql`, "utf8"));
  const person = (base: number) => `('00000000-0000-4000-8000-' || lpad((${base} + n)::text, 12, '0'))::uuid`;
  await db.exec(`insert into public.dance_styles(id, name, category) values ('${rumba}', 'Rumba', 'latin');
    insert into auth.users(id, email) values ('${admin}', 'admin@example.test'), ('${friend}', 'friend@example.test'),
      ('${third}', 'third@example.test'), ('${fourth}', 'fourth@example.test'), ('${partner}', 'partner@example.test'),
      ('${outsider}', 'outsider@example.test');
    update public.profiles set is_super_admin = true where id = '${admin}';
    update public.profiles set can_propose_results = true where id = '${friend}';
    update public.profiles set display_name = 'Fourth Manager' where id = '${fourth}';
    insert into public.seasons(id, name, is_active) values ('${season}', 'S35', true);
    insert into public.competition_weeks(id, season_id, week_number, is_finale) values
      ('${week8}', '${season}', 8, false), ('${week9}', '${season}', 9, false), ('${week10}', '${season}', 10, false),
      ('${week11}', '${season}', 11, false), ('${week12}', '${season}', 12, true);
    insert into public.episodes(id, season_id, week_id, episode_number, airs_at, expected_dance_count) values
      ('${e09}', '${season}', '${week8}', 9, now() - interval '9 days', 1),
      ('${e10}', '${season}', '${week9}', 10, now() - interval '47 hours', 1),
      ('${e11}', '${season}', '${week10}', 11, now() + interval '5 days', 1),
      ('${e12}', '${season}', '${week11}', 12, now() + interval '12 days', 1),
      ('${e13}', '${season}', '${week12}', 13, now() + interval '19 days', 1);
    insert into public.people(id, name, role) values
      ('${judges[0]}', 'Carrie Ann Inaba', 'judge'), ('${judges[1]}', 'Derek Hough', 'judge'), ('${judges[2]}', 'Bruno Tonioli', 'judge');
    insert into public.people(id, name, role) select ${person(40)}, 'Celebrity ' || n, 'celebrity' from generate_series(0, 9) n;
    insert into public.people(id, name, role) select ${person(50)}, 'Pro ' || n, 'pro' from generate_series(0, 9) n;
    insert into public.couples(id, season_id, celebrity_id, pro_id)
      select ${person(30)}, '${season}', ${person(40)}, ${person(50)} from generate_series(0, 9) n;
    insert into public.leagues(id, name, invite_code, commissioner_id, roster_size, draft_status, waiver_mode, waiver_claim_method, recast_on_since, trades_enabled, trades_on_since)
      values ('${league}', 'Removals', 'REMOVE', '${admin}', 2, 'completed', 'waivers', 'reverse_standings', now() - interval '3 days', true, now() - interval '3 days');
    insert into public.league_members(league_id, user_id, role, co_manager_id, draft_position) values
      ('${league}', '${admin}', 'commissioner', null, 1), ('${league}', '${friend}', 'manager', '${partner}', 2),
      ('${league}', '${third}', 'manager', null, 3), ('${league}', '${fourth}', 'manager', null, 4);
    insert into public.scoring_settings(league_id, judges_score_starts_week, judges_score_category_weight, dance_card_version)
      values ('${league}', 8, 1, 'v3');
    insert into public.roster_slots(league_id, manager_id, slot_number, couple_id, source, start_week) values
      ('${league}', '${admin}', 1, '${a}', 'draft', 1), ('${league}', '${admin}', 2, '${f}', 'draft', 1),
      ('${league}', '${friend}', 1, '${g}', 'draft', 1), ('${league}', '${friend}', 2, '${e}', 'draft', 1),
      ('${league}', '${third}', 1, '${b}', 'draft', 1), ('${league}', '${third}', 2, '${c}', 'draft', 1),
      ('${league}', '${fourth}', 1, '${d}', 'draft', 1), ('${league}', '${fourth}', 2, '${h}', 'draft', 1);`);
}, 120000);
afterAll(async () => db?.close());

async function asUser(uid: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.exec("set role authenticated");
}
async function asService() {
  await db.exec("reset role");
}
async function saveNight(episode: string, dancing: string[], eliminated: string[] = []) {
  const entries = [...dancing, ...eliminated].map((couple) => ({
    coupleId: couple, outcome: eliminated.includes(couple) ? "eliminated" : "safe", savedByJudges: false, hadImmunity: false,
    bonusPoints: 0, bonusNote: null,
    dances: [{ danceStyleId: rumba, songTitle: "Song", judgeScores: judges.map((judgeId) => ({ judgeId, score: 8 })) }],
  }));
  await db.query("select public.save_episode_draft_checked($1)", [
    JSON.stringify({ episodeId: episode, updatedBy: friend, guestJudgeName: null, judgesSaveAvailable: false, inJeopardyCoupleIds: [], entries, correctionToken: null }),
  ]);
}
async function finishWeek(episode: string) {
  const data = (await db.query<{ data: PublicationSnapshot }>("select public.episode_publication_snapshot($1) as data", [episode])).rows[0].data;
  const lifeline = (await db.query<{ data: LifelineInputs }>("select public.lifeline_publication_inputs() as data")).rows[0].data;
  const plan = buildPublicationPlan(data, episode, lifeline);
  await db.query("select public.commit_episode_publication_with_later_weeks($1, $2, $3, $4)", [episode, admin, JSON.stringify(data), JSON.stringify(plan)]);
}
type Leg = { from: string; to: string; couple?: string; points?: number };
const propose = async (legs: Leg[]) =>
  (await db.query<{ id: string }>("select public.propose_trade($1, $2) as id", [
    league,
    JSON.stringify(legs.map((leg) => ({ from_manager_id: leg.from, to_manager_id: leg.to, couple_id: leg.couple ?? null, points: leg.points ?? null }))),
  ])).rows[0].id;
const respond = async (trade: string, accept: boolean) =>
  (await db.query<{ status: string }>("select public.respond_to_trade($1, $2) as status", [trade, accept])).rows[0].status;
const veto = async (trade: string) => (await db.query<{ status: string }>("select public.veto_trade($1) as status", [trade])).rows[0].status;
const offer = async (trade: string) =>
  (await db.query<{ status: string; result: string | null; week: number | null }>("select status, result, week_number as week from public.trade_offers where id = $1", [trade])).rows[0];
const saveList = (claims: { couple: string; slot: number; drop?: string }[]) =>
  db.query("select * from public.save_recast_list($1, $2)", [
    league,
    JSON.stringify(claims.map((claim) => ({ couple_id: claim.couple, slot_number: claim.slot, drop_couple_id: claim.drop ?? null }))),
  ]);
const posted = (episode: string, hoursAgo: number) =>
  db.query(
    `update public.episodes set results_published_at = now() - interval '${hoursAgo} hours',
       airs_at = least(airs_at, now() - interval '${hoursAgo + 3} hours') where id = $1`,
    [episode]
  );
const processDue = async () => (await db.query<{ runs: unknown[] }>("select public.process_due_recasts() as runs")).rows[0].runs;
const roster = async (managerId: string) =>
  (await db.query<{ slot: number; couple_id: string; start: number; end: number | null }>(
    `select slot_number as slot, couple_id, start_week as start, end_week as end
     from public.roster_slots where league_id = $1 and manager_id = $2 order by slot_number, start_week`, [league, managerId])).rows;
const members = async () =>
  (await db.query<{ user_id: string }>("select user_id from public.league_members where league_id = $1 order by draft_position", [league])).rows.map((row) => row.user_id);
const order = async () =>
  (await db.query<{ manager_id: string }>("select manager_id from public.recast_order($1) order by list_position", [league])).rows.map((row) => row.manager_id);
const scoreWeeks = async (managerId: string) =>
  (await db.query<{ week_number: number }>(
    `select w.week_number from public.weekly_manager_scores s join public.competition_weeks w on w.id = s.week_id
     where s.league_id = $1 and s.manager_id = $2 order by w.week_number`, [league, managerId])).rows.map((row) => row.week_number);
const releases = async () =>
  (await db.query<{ manager_id: string; manager_name: string; couple_id: string; week_number: number }>(
    "select manager_id, manager_name, couple_id, week_number from public.roster_releases where league_id = $1 order by couple_id", [league])).rows;
const effectiveWeek = async () => (await db.query<{ week: number }>("select public.release_effective_week() as week")).rows[0].week;

describe("Removing a manager after the draft", () => {
  it("re-checks the veto majority with one team fewer", async () => {
    await saveNight(e09, [a, b, c, d, e, g, h, i, j], [f]);
    await finishWeek(e09);
    await posted(e09, 7 * 24);
    await saveNight(e10, [a, b, c, d, e, g, h, i, j]);
    await finishWeek(e10);
    expect(await effectiveWeek()).toBe(10);

    await asUser(admin);
    const swap = await propose([{ from: admin, to: friend, couple: a }, { from: friend, to: admin, couple: g }]);
    await asUser(friend);
    expect(await respond(swap, true)).toBe("accepted");
    // One of two teams outside the trade: not a majority.
    await asUser(fourth);
    expect(await veto(swap)).toBe("accepted");

    await asUser(friend);
    await expect(db.query("select public.remove_league_member($1, $2)", [league, third])).rejects.toThrow(/Only the commissioner/);
    await asUser(admin);
    await expect(db.query("select public.remove_league_member($1, $2)", [league, admin])).rejects.toThrow(/Leave League/);
    await db.query("select public.remove_league_member($1, $2)", [league, third]);
    await asService();
    expect(await members()).toEqual([admin, friend, fourth]);
    // Now one of one, so the vote already cast carries.
    expect((await offer(swap)).status).toBe("vetoed");
    expect(await roster(third)).toEqual([
      { slot: 1, couple_id: b, start: 1, end: 9 },
      { slot: 2, couple_id: c, start: 1, end: 9 },
    ]);
    expect(await order()).not.toContain(third);
    // History stays.
    expect(await scoreWeeks(third)).toEqual([8, 9]);
  });

  it("cancels their claim, Lifeline pick, unaired picks and offers, and the next run awards a freed couple", async () => {
    await asUser(admin);
    const trade = await propose([{ from: admin, to: fourth, couple: a }, { from: fourth, to: admin, couple: h }]);
    await asUser(fourth);
    expect(await respond(trade, true)).toBe("accepted");
    await saveList([{ couple: i, slot: 1, drop: d }]);
    await asService();
    await db.query(
      `insert into public.lifeline_picks(league_id, manager_id, week_id, slot_number, couple_id, picked_by) values ($1, $2, $3, 1, $4, $2)`,
      [league, fourth, week10, j]
    );
    await db.query(
      `insert into public.predictions(league_id, manager_id, week_id, predicted_eliminated_couple_id) values ($1, $2, $3, $4), ($1, $2, $5, $4)`,
      [league, fourth, week9, b, week10]
    );
    await db.query("insert into public.grand_finale_predictions(league_id, manager_id, couple_id, predicted_position) values ($1, $2, $3, 1)", [league, fourth, f]);

    // Fourth walks: Leave League takes the same path as a removal.
    await asUser(fourth);
    await db.query("select public.leave_league($1)", [league]);
    await asService();
    expect(await members()).toEqual([admin, friend]);
    expect(await offer(trade)).toEqual({ status: "failed", result: "left_league", week: 9 });
    expect((await db.query("select 1 from public.waiver_claims where manager_id = $1 and status = 'pending'", [fourth])).rows).toEqual([]);
    expect((await db.query("select 1 from public.lifeline_picks where manager_id = $1", [fourth])).rows).toEqual([]);
    expect((await db.query<{ week_id: string }>("select week_id from public.predictions where manager_id = $1", [fourth])).rows).toEqual([{ week_id: week9 }]);
    expect((await db.query("select 1 from public.grand_finale_predictions where manager_id = $1", [fourth])).rows).toHaveLength(1);
    expect(await releases()).toEqual([
      { manager_id: third, manager_name: expect.any(String), couple_id: b, week_number: 10 },
      { manager_id: third, manager_name: expect.any(String), couple_id: c, week_number: 10 },
      { manager_id: fourth, manager_name: "Fourth Manager", couple_id: d, week_number: 10 },
      { manager_id: fourth, manager_name: "Fourth Manager", couple_id: h, week_number: 10 },
    ]);

    // The freed couples are claimable and the run awards one.
    await asUser(friend);
    await saveList([{ couple: d, slot: 2, drop: e }]);
    await asService();
    await posted(e10, 48);
    expect(await processDue()).toHaveLength(1);
    expect(await roster(friend)).toEqual([
      { slot: 1, couple_id: g, start: 1, end: null },
      { slot: 2, couple_id: e, start: 1, end: 9 },
      { slot: 2, couple_id: d, start: 10, end: null },
    ]);
  });

  it("refuses a removed manager at the invite code, with or without a roster, and lets a newcomer in", async () => {
    await asUser(fourth);
    await expect(db.query("select public.join_league($1)", ["REMOVE"])).rejects.toThrow(/removed from this league/);
    // A manager who joined after the draft has no roster or score rows, only picks.
    await asUser(outsider);
    await db.query("select public.join_league($1)", ["REMOVE"]);
    await asService();
    expect(await members()).toEqual([admin, friend, outsider]);
    await db.query("insert into public.predictions(league_id, manager_id, week_id, predicted_eliminated_couple_id) values ($1, $2, $3, $4)", [league, outsider, week9, b]);
    await asUser(admin);
    await db.query("select public.remove_league_member($1, $2)", [league, outsider]);
    await asUser(outsider);
    await expect(db.query("select public.join_league($1)", ["REMOVE"])).rejects.toThrow(/removed from this league/);
    await asService();
    expect(await members()).toEqual([admin, friend]);
  });

  it("refuses a claim saved by a team that is gone, at commit", async () => {
    await asService();
    await expect(
      db.exec(`begin;
        insert into public.waiver_claims(league_id, couple_id, manager_id, slot_number, week_number, priority_order)
        values ('${league}', '${i}', '${fourth}', 1, 10, 1);
        commit;`)
    ).rejects.toThrow(/no longer in this league/);
    await db.exec("rollback").catch(() => {});
  });

  it("keeps an aired week that isn't published, ends a closed row that reaches past the boundary, and scores them no further", async () => {
    await asService();
    // Friend won J for Week 12, closing E's row through Week 11; D was awarded above.
    await db.query("update public.roster_slots set end_week = 11 where league_id = $1 and manager_id = $2 and couple_id = $3", [league, friend, d]);
    await db.query(
      "insert into public.roster_slots(league_id, manager_id, slot_number, couple_id, source, start_week) values ($1, $2, 2, $3, 'waiver', 12)",
      [league, friend, j]
    );
    // Week 10 has aired and is being entered.
    await db.query("update public.episodes set airs_at = now() - interval '1 hour' where id = $1", [e11]);
    expect(await effectiveWeek()).toBe(11);
    await saveNight(e11, [a, b, c, d, e, g, h, i, j]);

    await asUser(admin);
    await expect(db.query("select public.remove_league_member($1, $2)", [league, friend])).resolves.toBeTruthy();
    await asService();
    expect(await roster(friend)).toEqual([
      { slot: 1, couple_id: g, start: 1, end: 10 },
      { slot: 2, couple_id: e, start: 1, end: 9 },
      { slot: 2, couple_id: d, start: 10, end: 10 },
    ]);
    expect((await releases()).filter((row) => row.manager_id === friend).map((row) => [row.couple_id, row.week_number])).toEqual([[d, 11], [g, 11]]);

    // The aired week still pays them; the week after does not.
    await finishWeek(e11);
    expect(await scoreWeeks(friend)).toEqual([8, 9, 10]);
    await db.query("update public.episodes set airs_at = now() - interval '1 hour' where id = $1", [e12]);
    await saveNight(e12, [a, b, c, d, e, g, h, i, j]);
    await finishWeek(e12);
    expect(await scoreWeeks(friend)).toEqual([8, 9, 10]);
    expect(await scoreWeeks(admin)).toEqual([8, 9, 10, 11]);
  });

  it("keeps the Finale once every week's first night has aired", async () => {
    await asService();
    await db.query("update public.episodes set airs_at = now() - interval '1 hour' where id = $1", [e13]);
    expect(await effectiveWeek()).toBe(13);
  });

  it("clears the release log with a draft reset", async () => {
    await asUser(admin);
    await db.query("select public.reset_draft($1)", [league]);
    await asService();
    expect(await releases()).toEqual([]);
    expect((await db.query("select 1 from public.league_departures where league_id = $1", [league])).rows).toEqual([]);
  });
});
