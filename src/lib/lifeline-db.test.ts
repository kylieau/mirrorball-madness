import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DanceCardSnapshot } from "./dance-card-refresh";
import { buildPublicationPlan, type LifelineInputs, type PublicationSnapshot } from "./episode-publication";
import { buildLifelineEqualizer, lifelineSeason } from "./lifeline";

// A v3 league (two-couple rosters, rate 0.2731, Anchor Week 8, Dance Card
// weight 0.6) through Lifeline's life: the Equalizer at turn-on, picks for
// Week 10, the lock, the Week 10 publish, then a correction to Week 9.
// Week 8 sends two couples home, Week 9 one, Week 10 one. Every 24 is worth
// 6.55 in judges' points; survival steps are 3.00, 1.24 and 0.96.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1), friend = id(2), third = id(3), partner = id(5), outsider = id(6);
const season = id(4), league = id(7), rumba = id(9);
const [week8, week9, week10] = [id(10), id(11), id(12)];
const [e09, e10, e11] = [id(13), id(14), id(15)];
const judges = [id(20), id(21), id(22)];
const [a, b, c, d, e, f, g] = [0, 1, 2, 3, 4, 5, 6].map((n) => id(30 + n));

const LIVE_STACK = [
  "apply-audit-security", "apply-audit-deadlines", "apply-audit-settings", "apply-audit-prediction-provenance",
  "apply-curtain-call-backfill", "apply-curtain-call-backfill-lock-check", "apply-service-role-season-grants",
  "apply-drop-curtain-call-lock-guard", "apply-team-dance-entity", "apply-special-dances", "apply-special-dances-polish",
  "apply-draft-release-own-rows", "apply-whole-judge-marks", "apply-special-draft-release",
  "apply-contributor-special-setup", "apply-draft-lineup", "apply-retire-special-leftovers", "apply-episode-rounds",
  "apply-special-dance-label", "apply-dance-card-v2", "apply-dance-card-v3", "apply-lifeline",
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
  await db.exec(`insert into public.dance_styles(id, name, category) values ('${rumba}', 'Rumba', 'latin');
    insert into auth.users(id, email) values ('${admin}', 'admin@example.test'), ('${friend}', 'friend@example.test'),
      ('${third}', 'third@example.test'), ('${partner}', 'partner@example.test'), ('${outsider}', 'outsider@example.test');
    update public.profiles set is_super_admin = true where id = '${admin}';
    update public.profiles set can_propose_results = true where id = '${friend}';
    insert into public.seasons(id, name, is_active) values ('${season}', 'S35', true);
    insert into public.competition_weeks(id, season_id, week_number) values
      ('${week8}', '${season}', 8), ('${week9}', '${season}', 9), ('${week10}', '${season}', 10);
    insert into public.episodes(id, season_id, week_id, episode_number, airs_at, expected_dance_count) values
      ('${e09}', '${season}', '${week8}', 9, now() - interval '7 days', 1),
      ('${e10}', '${season}', '${week9}', 10, now() - interval '1 hour', 1),
      ('${e11}', '${season}', '${week10}', 11, now() + interval '6 days', 1);
    insert into public.people(id, name, role) values
      ('${judges[0]}', 'Carrie Ann Inaba', 'judge'), ('${judges[1]}', 'Derek Hough', 'judge'), ('${judges[2]}', 'Bruno Tonioli', 'judge');
    insert into public.people(id, name, role) select ('00000000-0000-4000-8000-' || lpad((40 + n)::text, 12, '0'))::uuid, 'Celebrity ' || n, 'celebrity' from generate_series(0, 6) n;
    insert into public.people(id, name, role) select ('00000000-0000-4000-8000-' || lpad((50 + n)::text, 12, '0'))::uuid, 'Pro ' || n, 'pro' from generate_series(0, 6) n;
    insert into public.couples(id, season_id, celebrity_id, pro_id)
      select ('00000000-0000-4000-8000-' || lpad((30 + n)::text, 12, '0'))::uuid, '${season}',
             ('00000000-0000-4000-8000-' || lpad((40 + n)::text, 12, '0'))::uuid, ('00000000-0000-4000-8000-' || lpad((50 + n)::text, 12, '0'))::uuid
      from generate_series(0, 6) n;
    insert into public.leagues(id, name, invite_code, commissioner_id, roster_size) values ('${league}', 'Lifeline', 'LIFE', '${admin}', 2);
    insert into public.league_members(league_id, user_id, role, co_manager_id) values
      ('${league}', '${admin}', 'commissioner', null), ('${league}', '${friend}', 'manager', '${partner}'), ('${league}', '${third}', 'manager', null);
    insert into public.scoring_settings(league_id, judges_score_starts_week, judges_score_category_weight, dance_card_version)
      values ('${league}', 8, 0.6, 'v3');
    insert into public.roster_slots(league_id, manager_id, slot_number, couple_id, source, start_week) values
      ('${league}', '${admin}', 1, '${a}', 'draft', 1), ('${league}', '${admin}', 2, '${f}', 'draft', 1),
      ('${league}', '${friend}', 1, '${g}', 'draft', 1), ('${league}', '${friend}', 2, '${e}', 'draft', 1),
      ('${league}', '${third}', 1, '${b}', 'draft', 1), ('${league}', '${third}', 2, '${c}', 'draft', 1);`);
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
type Night = { couple: string; marks?: number[]; outcome?: string }[];
async function saveNight(episode: string, night: Night, correctionToken: string | null = null) {
  const entries = night.map(({ couple, marks = [8, 8, 8], outcome = "safe" }) => ({
    coupleId: couple, outcome, savedByJudges: false, hadImmunity: false, bonusPoints: 0, bonusNote: null,
    dances: [{ danceStyleId: rumba, songTitle: "Song", judgeScores: marks.map((score, j) => ({ judgeId: judges[j], score })) }],
  }));
  await db.query("select public.save_episode_draft_checked($1)", [
    JSON.stringify({ episodeId: episode, updatedBy: correctionToken ? admin : friend, guestJudgeName: null, judgesSaveAvailable: false, inJeopardyCoupleIds: [], entries, correctionToken }),
  ]);
}
async function snapshot(episode: string): Promise<PublicationSnapshot> {
  return (await db.query<{ data: PublicationSnapshot }>("select public.episode_publication_snapshot($1) as data", [episode])).rows[0].data;
}
async function lifelineInputs(): Promise<LifelineInputs> {
  return (await db.query<{ data: LifelineInputs }>("select public.lifeline_publication_inputs() as data")).rows[0].data;
}
async function finishWeek(episode: string, edit: (plan: Record<string, unknown>) => Record<string, unknown> = (plan) => plan) {
  const data = await snapshot(episode);
  const plan = edit({ ...buildPublicationPlan(data, episode, await lifelineInputs()) });
  await db.query("select public.commit_episode_publication_with_later_weeks($1, $2, $3, $4)", [episode, admin, JSON.stringify(data), JSON.stringify(plan)]);
}
async function equalizer(startsWeek: number) {
  const data = (await db.query<{ s: DanceCardSnapshot }>("select public.dance_card_snapshot() as s")).rows[0].s;
  return buildLifelineEqualizer(lifelineSeason(data), league, startsWeek).map((row) => ({
    manager_id: row.managerId, points: row.points, weighted_points: row.weightedPoints, detail: row.detail,
  }));
}
const pick = (week: string, slot: number, couple: string) =>
  db.query("select public.set_lifeline_pick($1, $2, $3, $4)", [league, week, slot, couple]);
const standings = async (managerId: string, weekId: string) =>
  (await db.query<{ lifeline: number; transfer: number; total: number; stored: number }>(
    `select v.lifeline_points::float as lifeline, v.transfer_points::float as transfer, v.total_points::float as total, s.total_points::float as stored
     from public.weekly_manager_standings v join public.weekly_manager_scores s using (league_id, manager_id, week_id)
     where v.manager_id = $1 and v.week_id = $2`, [managerId, weekId])).rows[0];
const payouts = async (weekId: string) =>
  (await db.query<{ manager_id: string; slot: number; couple_id: string; credit: number; survived: boolean; points: number; weighted: number }>(
    `select manager_id, slot_number as slot, couple_id, credit::float as credit, survived, points::float as points, weighted_points::float as weighted
     from public.lifeline_payouts where week_id = $1 order by manager_id, slot_number`, [weekId])).rows;
const visiblePicks = async () =>
  (await db.query<{ manager_id: string; slot: number; couple_id: string }>(
    "select manager_id, slot_number as slot, couple_id from public.lifeline_picks order by manager_id, slot_number")).rows;

describe("Lifeline on a Dance Card v3 league", () => {
  it("is off until a commissioner turns it on, and publishing is unchanged", async () => {
    await saveNight(e09, [a, b, c, d, e].map((couple) => ({ couple })).concat([{ couple: f, outcome: "eliminated" }, { couple: g, outcome: "eliminated" }] as never));
    await finishWeek(e09);
    expect(await standings(admin, week8)).toEqual({ lifeline: 0, transfer: 0, total: 9.66, stored: 9.66 });

    await asUser(friend);
    await expect(pick(week10, 1, a)).rejects.toThrow(/Lifeline is off/);
    await asService();
    // Week 9 has aired and isn't published: its numbers would be missing
    // from the Equalizer, so turning Lifeline on waits.
    await expect(db.query("select public.enable_lifeline($1, $2, $3, $4)", [league, admin, 10, "[]"])).rejects.toThrow(/results are in/);
  });

  it("turns on with the Equalizer the commissioner confirmed", async () => {
    await saveNight(e10, [{ couple: a }, { couple: b }, { couple: c }, { couple: d }, { couple: e, outcome: "eliminated" }]);
    await finishWeek(e10);

    // Week 9: A–D each earned 6.55 + 1.24 = 7.79 and survive, E went home
    // on 6.55. The average Lifeline is 0.5 × 37.71 / 5 = 3.77; Admin's spot 2 (F)
    // and Friend's spot 1 (G) were dead that week, Week 8 itself never is.
    const rows = await equalizer(10);
    expect(rows.sort((x, y) => x.manager_id.localeCompare(y.manager_id))).toEqual([
      { manager_id: admin, points: 3.77, weighted_points: 2.26, detail: { weeks: [9], slotWeeks: 1 } },
      { manager_id: friend, points: 3.77, weighted_points: 2.26, detail: { weeks: [9], slotWeeks: 1 } },
    ]);

    await expect(db.query("select public.enable_lifeline($1, $2, $3, $4)", [league, friend, 10, JSON.stringify(rows)])).rejects.toThrow(/Only a commissioner/);
    await expect(db.query("select public.enable_lifeline($1, $2, $3, $4)", [league, admin, 9, JSON.stringify(rows)])).rejects.toThrow(/numbers changed/);
    await expect(db.query("select public.enable_lifeline($1, $2, $3, $4)", [league, admin, 10, JSON.stringify([{ ...rows[0], manager_id: outsider }])])).rejects.toThrow(/Invalid Equalizer/);
    await db.query("select public.enable_lifeline($1, $2, $3, $4)", [league, admin, 10, JSON.stringify(rows)]);
    await expect(db.query("select public.enable_lifeline($1, $2, $3, $4)", [league, admin, 10, "[]"])).rejects.toThrow(/already on/);

    // It lands on the latest published week, on top of the stored total.
    const adminWeek9 = await standings(admin, week9);
    expect(adminWeek9.lifeline).toBe(2.26);
    expect(adminWeek9.total).toBeCloseTo(adminWeek9.stored + 2.26, 2);
    expect((await standings(third, week9)).lifeline).toBe(0);
  });

  it("takes one pick per dead spot until the lock", async () => {
    await asUser(admin);
    await expect(pick(week9, 2, b)).rejects.toThrow(/starts in Week 10/);
    await expect(pick(week10, 1, b)).rejects.toThrow(/still has a couple dancing/);
    await expect(pick(week10, 2, a)).rejects.toThrow(/don't already have/);
    await expect(pick(week10, 2, e)).rejects.toThrow(/no longer dancing/);
    await pick(week10, 2, c);
    await pick(week10, 2, b);

    await asUser(third);
    await expect(pick(week10, 1, a)).rejects.toThrow(/still has a couple dancing/);
    await asUser(outsider);
    await expect(pick(week10, 1, a)).rejects.toThrow(/not in this league/);

    // Friend has two dead spots; the co-manager picks for the same team.
    await asUser(friend);
    await pick(week10, 1, a);
    await expect(pick(week10, 2, a)).rejects.toThrow(/other Lifeline already has/);
    await pick(week10, 2, d);
    await asUser(partner);
    await pick(week10, 2, c);
    expect(await visiblePicks()).toEqual([{ manager_id: friend, slot: 1, couple_id: a }, { manager_id: friend, slot: 2, couple_id: c }]);

    // Peers' picks stay hidden until the lock.
    await asUser(admin);
    expect(await visiblePicks()).toEqual([{ manager_id: admin, slot: 2, couple_id: b }]);
    await expect(db.query("select public.disable_lifeline($1)", [league])).rejects.toThrow(/can't be turned off/);
    await expect(db.query("insert into public.lifeline_picks(league_id, manager_id, week_id, slot_number, couple_id, picked_by) values ($1, $2, $3, 1, $4, $2)", [league, admin, week10, d])).rejects.toThrow(/permission denied/);

    await asService();
    await db.query("update public.episodes set airs_at = now() - interval '1 hour' where id = $1", [e11]);
    await asUser(admin);
    await expect(pick(week10, 2, d)).rejects.toThrow(/locked/);
    await expect(db.query("select public.clear_lifeline_pick($1, $2, 2)", [league, week10])).rejects.toThrow(/locked/);
    expect(await visiblePicks()).toHaveLength(3);
    await asUser(outsider);
    expect(await visiblePicks()).toEqual([]);
    await asService();
  });

  it("settles with the week and refuses a plan that doesn't cover the picks", async () => {
    // Week 10: 26 each (7.10) plus a 0.96 step is 8.06; C goes home.
    const night: Night = [{ couple: a, marks: [9, 9, 8] }, { couple: b, marks: [9, 9, 8] }, { couple: c, marks: [9, 9, 8], outcome: "eliminated" }, { couple: d, marks: [9, 9, 8] }];
    await saveNight(e11, night);
    await expect(finishWeek(e11, (plan) => ({ ...plan, lifelinePayouts: undefined, lifelineEqualizers: undefined }))).rejects.toThrow(/cannot score/);
    await expect(finishWeek(e11, (plan) => ({ ...plan, lifelinePayouts: (plan.lifelinePayouts as unknown[]).slice(1) }))).rejects.toThrow(/Lifeline picks changed/);
    await expect(finishWeek(e11, (plan) => ({ ...plan, lifelineEqualizers: [] }))).rejects.toThrow(/Equalizer changed/);
    expect(await payouts(week10)).toEqual([]);
    await finishWeek(e11);

    expect(await payouts(week10)).toEqual([
      { manager_id: admin, slot: 2, couple_id: b, credit: 8.06, survived: true, points: 4.03, weighted: 2.42 },
      { manager_id: friend, slot: 1, couple_id: a, credit: 8.06, survived: true, points: 4.03, weighted: 2.42 },
      { manager_id: friend, slot: 2, couple_id: c, credit: 7.1, survived: false, points: 3.55, weighted: 2.13 },
    ]);
    const adminWeek10 = await standings(admin, week10);
    expect(adminWeek10.lifeline).toBe(2.42);
    expect(adminWeek10.total).toBeCloseTo(adminWeek10.stored + 2.42, 2);
    // The stored rows are exactly what they would be without Lifeline.
    expect(adminWeek10.stored).toBeCloseTo(8.06 * 0.6, 2);

    await asUser(third);
    expect((await db.query("select 1 from public.lifeline_payouts")).rows).toHaveLength(3);
    await asUser(outsider);
    expect((await db.query("select 1 from public.lifeline_payouts")).rows).toHaveLength(0);
    expect((await db.query("select 1 from public.weekly_manager_standings")).rows).toHaveLength(0);
    await asService();
  });

  it("recomputes the Equalizer and later payouts when an earlier week is corrected", async () => {
    // A's Week 9 becomes a 30: 8.19 + 1.24 = 9.43, so the average Lifeline
    // that week is 0.5 × (9.43 + 3 × 7.79 + 6.55) / 5 = 3.94.
    const token = (await db.query<{ token: string }>("select public.seed_episode_correction($1, $2) as token", [e10, admin])).rows[0].token;
    await saveNight(e10, [{ couple: a, marks: [10, 10, 10] }, { couple: b }, { couple: c }, { couple: d }, { couple: e, outcome: "eliminated" }], token);
    await finishWeek(e10);
    const adminWeek9 = await standings(admin, week9);
    expect(adminWeek9.lifeline).toBe(2.36);
    expect(adminWeek9.total).toBeCloseTo(adminWeek9.stored + 2.36, 2);
    expect(await payouts(week10)).toHaveLength(3);
    expect((await standings(admin, week10)).lifeline).toBe(2.42);

    // The Dance Card version is pinned once Lifeline points are built on it.
    await expect(db.query("update public.scoring_settings set dance_card_version = 'v2' where league_id = $1", [league])).rejects.toThrow(/Lifeline points/);
  });
});
