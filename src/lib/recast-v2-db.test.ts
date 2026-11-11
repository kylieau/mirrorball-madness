import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPublicationPlan, type LifelineInputs, type PublicationSnapshot } from "./episode-publication";
import { recastDraftRank, recastOrder } from "./recast";

// A v3 league (two-couple rosters, Anchor Week 8) through three waiver runs.
// Week 8 sends F and G home, leaving Admin and Friend an open spot each;
// D, H and I were never drafted. After Week 9 the reverse standings order is
// Friend, Admin, Third. Week 12 is the Finale.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1), friend = id(2), third = id(3), partner = id(5), outsider = id(6);
const season = id(4), league = id(7), tieLeague = id(8), rumba = id(9);
const [week8, week9, week10, week11, week12] = [id(10), id(11), id(12), id(13), id(14)];
const [e09, e10, e11, e12a, e12b, e13] = [id(15), id(16), id(17), id(18), id(19), id(60)];
const judges = [id(20), id(21), id(22)];
const [a, b, c, d, e, f, g, h, i] = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => id(30 + n));

const LIVE_STACK = [
  "apply-audit-security", "apply-audit-deadlines", "apply-audit-settings", "apply-audit-prediction-provenance",
  "apply-curtain-call-backfill", "apply-curtain-call-backfill-lock-check", "apply-service-role-season-grants",
  "apply-drop-curtain-call-lock-guard", "apply-team-dance-entity", "apply-special-dances", "apply-special-dances-polish",
  "apply-draft-release-own-rows", "apply-whole-judge-marks", "apply-special-draft-release",
  "apply-contributor-special-setup", "apply-draft-lineup", "apply-retire-special-leftovers", "apply-episode-rounds",
  "apply-special-dance-label", "apply-dance-card-v2", "apply-dance-card-v3", "apply-lifeline", "apply-recast-v2",
  "apply-recast-after-results",
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
      ('${third}', 'third@example.test'), ('${partner}', 'partner@example.test'), ('${outsider}', 'outsider@example.test');
    update public.profiles set is_super_admin = true where id = '${admin}';
    update public.profiles set can_propose_results = true where id = '${friend}';
    insert into public.seasons(id, name, is_active) values ('${season}', 'S35', true);
    insert into public.competition_weeks(id, season_id, week_number, is_finale) values
      ('${week8}', '${season}', 8, false), ('${week9}', '${season}', 9, false), ('${week10}', '${season}', 10, false),
      ('${week11}', '${season}', 11, false), ('${week12}', '${season}', 12, true);
    insert into public.episodes(id, season_id, week_id, episode_number, airs_at, expected_dance_count) values
      ('${e09}', '${season}', '${week8}', 9, now() - interval '9 days', 1),
      ('${e10}', '${season}', '${week9}', 10, now() - interval '47 hours', 1),
      ('${e11}', '${season}', '${week10}', 11, now() + interval '5 days', 1),
      ('${e12a}', '${season}', '${week11}', 12, now() + interval '12 days', 1),
      ('${e12b}', '${season}', '${week11}', 13, now() + interval '13 days', 1),
      ('${e13}', '${season}', '${week12}', 14, now() + interval '19 days', 1);
    insert into public.people(id, name, role) values
      ('${judges[0]}', 'Carrie Ann Inaba', 'judge'), ('${judges[1]}', 'Derek Hough', 'judge'), ('${judges[2]}', 'Bruno Tonioli', 'judge');
    insert into public.people(id, name, role) select ${person(40)}, 'Celebrity ' || n, 'celebrity' from generate_series(0, 8) n;
    insert into public.people(id, name, role) select ${person(50)}, 'Pro ' || n, 'pro' from generate_series(0, 8) n;
    insert into public.couples(id, season_id, celebrity_id, pro_id)
      select ${person(30)}, '${season}', ${person(40)}, ${person(50)} from generate_series(0, 8) n;
    insert into public.leagues(id, name, invite_code, commissioner_id, roster_size, draft_type, custom_pick_order) values
      ('${league}', 'Recast', 'RECAST', '${admin}', 2, 'snake', null),
      ('${tieLeague}', 'Ties', 'TIES', '${admin}', 1, 'custom', array['${third}', '${admin}', '${friend}']::uuid[]);
    insert into public.league_members(league_id, user_id, role, co_manager_id, draft_position) values
      ('${league}', '${admin}', 'commissioner', null, 1), ('${league}', '${friend}', 'manager', '${partner}', 2),
      ('${league}', '${third}', 'manager', null, 3),
      ('${tieLeague}', '${admin}', 'commissioner', null, 1), ('${tieLeague}', '${friend}', 'manager', null, 2),
      ('${tieLeague}', '${third}', 'manager', null, 3);
    insert into public.scoring_settings(league_id, judges_score_starts_week, judges_score_category_weight, dance_card_version)
      values ('${league}', 8, 1, 'v3'), ('${tieLeague}', 8, 1, 'v3');
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
async function saveNight(episode: string, night: Night) {
  const entries = night.map(({ couple, marks = [8, 8, 8], outcome = "safe" }) => ({
    coupleId: couple, outcome, savedByJudges: false, hadImmunity: false, bonusPoints: 0, bonusNote: null,
    dances: [{ danceStyleId: rumba, songTitle: "Song", judgeScores: marks.map((score, j) => ({ judgeId: judges[j], score })) }],
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
type Claim = { couple: string; slot: number; drop?: string };
const saveList = (claims: Claim[], leagueId = league) =>
  db.query("select * from public.save_recast_list($1, $2)", [
    leagueId,
    JSON.stringify(claims.map((claim) => ({ couple_id: claim.couple, slot_number: claim.slot, drop_couple_id: claim.drop ?? null }))),
  ]);
const aired = (episode: string, hoursAgo: number) =>
  db.query(`update public.episodes set airs_at = now() - interval '${hoursAgo} hours' where id = $1`, [episode]);
// A run comes due 48 hours after the week's results are posted.
const posted = (episode: string, hoursAgo: number) =>
  db.query(
    `update public.episodes set results_published_at = now() - interval '${hoursAgo} hours',
       airs_at = least(airs_at, now() - interval '${hoursAgo + 3} hours') where id = $1`,
    [episode]
  );
const processDue = async () => (await db.query<{ runs: unknown[] }>("select public.process_due_recasts() as runs")).rows[0].runs;
const claims = async () =>
  (await db.query<{ manager_id: string; couple_id: string; slot: number; drop: string | null; status: string; result: string | null; start: number | null }>(
    `select manager_id, couple_id, slot_number as slot, drop_couple_id as drop, status, result, start_week as start
     from public.waiver_claims order by manager_id, priority_order`)).rows;
const roster = async (managerId: string) =>
  (await db.query<{ slot: number; couple_id: string; source: string; start: number; end: number | null }>(
    `select slot_number as slot, couple_id, source, start_week as start, end_week as end
     from public.roster_slots where league_id = $1 and manager_id = $2 order by slot_number, start_week`, [league, managerId])).rows;
const nextCycle = async () =>
  (await db.query<{ week: number; start: number | null; results_in: boolean; due_in_hours: number }>(
    `select week_number as week, start_week as start, results_in, round(extract(epoch from due_at - now()) / 3600)::int as due_in_hours
     from public.recast_next_cycle($1)`, [league])).rows[0];

describe("Recast as a ranked waiver list", () => {
  it("is off until the commissioner turns it on, and then always runs in reverse standings", async () => {
    await saveNight(e09, [a, b, c, d, e, h, i].map((couple) => ({ couple })).concat([{ couple: f, outcome: "eliminated" }, { couple: g, outcome: "eliminated" }] as never));
    await finishWeek(e09);
    // Week 8's results went up long before Recast was turned on.
    await posted(e09, 7 * 24);
    await saveNight(e10, [a, b, c, d, h, i].map((couple) => ({ couple })).concat([{ couple: e, marks: [5, 5, 5] }] as never));
    await finishWeek(e10);

    await asUser(admin);
    await expect(saveList([{ couple: d, slot: 2 }])).rejects.toThrow(/does not use Recast/);
    await asService();
    await db.query("update public.leagues set waiver_mode = 'waivers', waiver_claim_method = 'fcfs' where id = $1", [league]);
    expect((await db.query("select waiver_claim_method from public.leagues where id = $1", [league])).rows).toEqual([{ waiver_claim_method: "reverse_standings" }]);
    expect((await db.query<{ manager_id: string }>("select manager_id from public.recast_order($1) order by list_position", [league])).rows.map((row) => row.manager_id))
      .toEqual([friend, admin, third]);
    expect(await nextCycle()).toEqual({ week: 9, start: 10, results_in: true, due_in_hours: 48 });
    await posted(e10, 47);
    expect(await nextCycle()).toEqual({ week: 9, start: 10, results_in: true, due_in_hours: 1 });
  });

  it("breaks ties on the most recent week, then on who drafted later", async () => {
    const scores = (rows: [string, string, number][]) =>
      db.query(`insert into public.weekly_manager_scores(league_id, manager_id, week_id, total_points)
        select $1, (r->>0)::uuid, (r->>1)::uuid, (r->>2)::numeric from jsonb_array_elements($2::jsonb) r`, [tieLeague, JSON.stringify(rows)]);
    // The order the Recast page shows has to be the one the run takes.
    const shownOrder = async () => {
      const { rows: [leagueRow] } = await db.query<{ draft_type: string; custom_pick_order: string[] | null }>(
        "select draft_type, custom_pick_order from public.leagues where id = $1", [tieLeague]);
      const { rows: members } = await db.query<{ user_id: string; draft_position: number | null }>(
        "select user_id, draft_position from public.league_members where league_id = $1", [tieLeague]);
      const { rows: totals } = await db.query<{ manager_id: string; week_number: number; total_points: string }>(
        `select s.manager_id, w.week_number, s.total_points from public.weekly_manager_standings s
         join public.competition_weeks w on w.id = s.week_id where s.league_id = $1`, [tieLeague]);
      return recastOrder(
        members.map((member) => ({ managerId: member.user_id, draftRank: recastDraftRank(leagueRow, member) })),
        totals.map((row) => ({ managerId: row.manager_id, weekNumber: row.week_number, totalPoints: Number(row.total_points) }))
      ).map((entry) => entry.managerId);
    };
    const order = async () => {
      const { rows } = await db.query<{ manager_id: string }>("select manager_id from public.recast_order($1) order by list_position", [tieLeague]);
      const ran = rows.map((row) => row.manager_id);
      expect(await shownOrder()).toEqual(ran);
      return ran;
    };
    // No scores at all: the custom draft order reversed (it went Third, Admin, Friend).
    expect(await order()).toEqual([friend, admin, third]);
    // Level on the season; Admin had the lower Week 9, and Friend and Third
    // are level there too, so Friend, who drafted later, goes ahead of Third.
    await scores([[admin, week8, 12], [admin, week9, 8], [friend, week8, 10], [friend, week9, 10], [third, week8, 10], [third, week9, 10]]);
    expect(await order()).toEqual([admin, friend, third]);
    // An Equalizer counts: the order reads standings, not the stored totals.
    await db.query(`insert into public.league_point_adjustments(league_id, manager_id, week_id, kind, points, weighted_points)
      values ($1, $2, $3, 'lifeline_equalizer', 1, 1)`, [tieLeague, admin, week8]);
    expect(await order()).toEqual([friend, third, admin]);
  });

  it("takes a ranked list of fills and paired drops, blind to the rest of the league", async () => {
    await asService();
    await db.query("select public.enable_lifeline($1, $2, 10, '[]')", [league, admin]);
    await asUser(admin);
    await db.query("select public.set_lifeline_pick($1, $2, 2, $3)", [league, week10, b]);
    await asUser(friend);
    await db.query("select public.set_lifeline_pick($1, $2, 1, $3)", [league, week10, c]);

    await asUser(outsider);
    await expect(saveList([{ couple: d, slot: 1 }])).rejects.toThrow(/not a member/);
    await asUser(admin);
    await expect(saveList([{ couple: b, slot: 2 }])).rejects.toThrow(/on another roster/);
    await expect(saveList([{ couple: d, slot: 1 }])).rejects.toThrow(/still has a couple dancing/);
    await expect(saveList([{ couple: d, slot: 2, drop: f }])).rejects.toThrow(/only drop a couple/);
    await expect(saveList([{ couple: d, slot: 2, drop: a }])).rejects.toThrow(/only drop a couple/);
    await expect(saveList([{ couple: a, slot: 2 }])).rejects.toThrow(/already on your roster/);
    await expect(saveList([{ couple: g, slot: 2 }])).rejects.toThrow(/no longer dancing/);
    await expect(saveList([{ couple: d, slot: 2 }, { couple: d, slot: 2 }])).rejects.toThrow(/already on your list/);
    await expect(saveList([{ couple: c, slot: 2 }])).rejects.toThrow(/on another roster/);

    // Third offers C as a drop, which puts C on the wire for everyone.
    await asUser(third);
    await saveList([{ couple: h, slot: 2, drop: c }]);
    await asUser(admin);
    expect((await db.query("select * from public.recast_pending_drops($1)", [league])).rows).toEqual([{ couple_id: c, manager_id: third }]);
    await saveList([{ couple: i, slot: 1, drop: a }, { couple: d, slot: 2 }]);
    // The list is replaced whole.
    await saveList([{ couple: d, slot: 2 }, { couple: c, slot: 2 }, { couple: i, slot: 1, drop: a }]);
    expect((await claims()).map((claim) => [claim.couple_id, claim.slot, claim.drop, claim.status])).toEqual([
      [d, 2, null, "pending"], [c, 2, null, "pending"], [i, 1, a, "pending"],
    ]);

    // The co-manager keeps the team's one list.
    await asUser(partner);
    await saveList([{ couple: d, slot: 1 }, { couple: h, slot: 1 }, { couple: h, slot: 2, drop: e }]);
    await asUser(friend);
    expect(await claims()).toHaveLength(3);
    await asUser(outsider);
    expect(await claims()).toHaveLength(0);
    expect((await db.query("select * from public.recast_pending_drops($1)", [league])).rows).toEqual([]);
  });

  it("runs once, 48 hours after the week's results are posted", async () => {
    await asService();
    expect(await processDue()).toEqual([]);
    // These tests move air times, not the clock, so Recast has to have been on a while.
    await db.query("update public.leagues set recast_on_since = now() - interval '60 days'");
    await posted(e10, 49);
    expect(await processDue()).toEqual([{ league_id: league, week: 9, awards: 4 }]);

    // Friend, first in line, fills their open spot with D. Admin's claim for
    // D loses; their next is C, which waits for Third's drop and takes it on
    // the second pass; their third pass drops A for I. Friend's H was gone
    // by their second turn, so E was never dropped.
    expect(await roster(admin)).toEqual([
      { slot: 1, couple_id: a, source: "draft", start: 1, end: 9 }, { slot: 1, couple_id: i, source: "waiver", start: 10, end: null },
      { slot: 2, couple_id: f, source: "draft", start: 1, end: 9 }, { slot: 2, couple_id: c, source: "waiver", start: 10, end: null },
    ]);
    expect(await roster(friend)).toEqual([
      { slot: 1, couple_id: g, source: "draft", start: 1, end: 9 }, { slot: 1, couple_id: d, source: "waiver", start: 10, end: null },
      { slot: 2, couple_id: e, source: "draft", start: 1, end: null },
    ]);
    expect(await roster(third)).toEqual([
      { slot: 1, couple_id: b, source: "draft", start: 1, end: null },
      { slot: 2, couple_id: c, source: "draft", start: 1, end: 9 }, { slot: 2, couple_id: h, source: "waiver", start: 10, end: null },
    ]);
    const results = (await claims()).map((claim) => [claim.manager_id, claim.couple_id, claim.drop, claim.result, claim.start]);
    expect(results).toEqual([
      [admin, d, null, "taken", null], [admin, c, null, "awarded", 10], [admin, i, a, "awarded", 10],
      [friend, d, null, "awarded", 10], [friend, h, null, "slot_filled", null], [friend, h, e, "taken", null],
      [third, h, c, "awarded", 10],
    ]);
    // Both filled spots lose the Lifeline they carried into Week 10.
    expect((await db.query("select 1 from public.lifeline_picks")).rows).toEqual([]);

    // A second call finds the run already made.
    expect(await processDue()).toEqual([]);
    expect((await db.query("select week_number, start_week, awards from public.recast_cycles")).rows).toEqual([{ week_number: 9, start_week: 10, awards: 4 }]);

    // The league reads the awards; a losing claim stays with its manager.
    await asUser(third);
    expect((await claims()).map((claim) => [claim.manager_id, claim.result])).toEqual([
      [admin, "awarded"], [admin, "awarded"], [friend, "awarded"], [third, "awarded"],
    ]);
    await asUser(admin);
    await expect(saveList([{ couple: a, slot: 1, drop: i }])).rejects.toThrow(/dropped that couple in the last waiver run/);
  });

  it("never runs before a week's results are posted, however long ago it aired", async () => {
    await asService();
    await db.query(`insert into public.waiver_claims(league_id, couple_id, manager_id, slot_number, week_number, priority_order, drop_couple_id)
      values ($1, $2, $3, 1, 10, 1, $4)`, [league, a, admin, i]);
    await aired(e11, 73);
    expect(await nextCycle()).toEqual({ week: 10, start: 11, results_in: false, due_in_hours: null });
    expect(await processDue()).toEqual([]);
    expect((await db.query("select * from public.recast_runs_overdue()")).rows).toEqual([]);
  });

  it("pays a week to whoever held the couple that week", async () => {
    // I (Admin's since Week 10) dances a 30 and A (dropped after Week 9) a 3;
    // everyone else a 24. Third holds two 24s.
    await saveNight(e11, [b, c, d, e, h].map((couple) => ({ couple })).concat([{ couple: i, marks: [10, 10, 10] }, { couple: a, marks: [1, 1, 1] }] as never));
    await finishWeek(e11);
    const points = Object.fromEntries(
      (await db.query<{ manager_id: string; points: number }>(
        "select manager_id, roster_points::float as points from public.weekly_manager_scores where league_id = $1 and week_id = $2", [league, week10])).rows
        .map((row) => [row.manager_id, row.points])
    );
    expect(points[friend]).toBe(points[third]);
    // 30 × 0.2731 against 24 × 0.2731.
    expect(points[admin] - points[third]).toBeCloseTo(1.64, 2);

    // Posted, the run comes due 48 hours later, and the drop lock still holds.
    expect(await nextCycle()).toEqual({ week: 10, start: 11, results_in: true, due_in_hours: 48 });
    await posted(e11, 49);
    expect(await processDue()).toEqual([{ league_id: league, week: 10, awards: 0 }]);
    expect((await claims()).find((claim) => claim.couple_id === a && claim.drop === i)).toMatchObject({ status: "rejected", result: "drop_locked" });
    expect((await db.query("select * from public.recast_runs_overdue()")).rows).toEqual([]);
  });

  it("treats a two-night week as one run, lifts the drop lock, and never runs for the Finale", async () => {
    await asService();
    await aired(e12a, 71);
    await aired(e12b, 47);
    await posted(e12a, 50);
    // One night posted isn't the week's results.
    expect(await nextCycle()).toEqual({ week: 11, start: 12, results_in: false, due_in_hours: null });
    expect(await processDue()).toEqual([]);

    // Two runs after dropping A, Admin can claim A again.
    await asUser(admin);
    await saveList([{ couple: a, slot: 1, drop: i }]);
    await asService();
    await posted(e12b, 47);
    expect(await nextCycle()).toEqual({ week: 11, start: 12, results_in: true, due_in_hours: 1 });
    expect(await processDue()).toEqual([]);
    await posted(e12b, 49);
    expect(await processDue()).toEqual([{ league_id: league, week: 11, awards: 1 }]);
    expect((await roster(admin)).filter((row) => row.slot === 1).slice(1)).toEqual([
      { slot: 1, couple_id: i, source: "waiver", start: 10, end: 11 }, { slot: 1, couple_id: a, source: "waiver", start: 12, end: null },
    ]);

    expect(await nextCycle()).toBeUndefined();
    await asUser(admin);
    await expect(saveList([{ couple: i, slot: 1, drop: a }])).rejects.toThrow(/no more waiver runs/);
    await saveList([]);
    await asService();
    await aired(e13, 73);
    expect(await processDue()).toEqual([]);
  });

  it("clears pending lists when Recast is turned off", async () => {
    await asService();
    await db.query("update public.leagues set waiver_mode = 'waivers' where id = $1", [tieLeague]);
    await db.query("insert into public.roster_slots(league_id, manager_id, slot_number, couple_id, source, start_week) values ($1, $2, 1, $3, 'draft', 1)", [tieLeague, admin, g]);
    await db.query(`insert into public.waiver_claims(league_id, couple_id, manager_id, slot_number, week_number, priority_order)
      values ($1, $2, $3, 1, 11, 1)`, [tieLeague, b, admin]);
    await db.query("update public.leagues set waiver_mode = 'locked' where id = $1", [tieLeague]);
    expect((await db.query("select waiver_claim_method from public.leagues where id = $1", [tieLeague])).rows).toEqual([{ waiver_claim_method: null }]);
    expect((await db.query("select 1 from public.waiver_claims where league_id = $1", [tieLeague])).rows).toEqual([]);
  });

  it("gives a couple freed mid-run to the first manager in line who was waiting on it", async () => {
    await asService();
    const claim = (managerId: string, couple: string, drop: string | null, week: number) =>
      db.query(`insert into public.waiver_claims(league_id, couple_id, manager_id, slot_number, week_number, priority_order, drop_couple_id)
        values ($1, $2, $3, 1, $4, 1, $5)`, [tieLeague, couple, managerId, week, drop]);
    const run = async (week: number, order: string[]) =>
      (await db.query<{ awards: number }>("select public.run_recast_claims($1, $2, $3, $4) as awards", [tieLeague, week, week + 1, order])).rows[0].awards;
    const results = async (week: number) =>
      (await db.query<{ manager_id: string; result: string }>(
        "select manager_id, result from public.waiver_claims where league_id = $1 and week_number = $2 order by manager_id", [tieLeague, week])).rows
        .map((row) => [row.manager_id, row.result]);
    const holderOf = async (couple: string) =>
      (await db.query<{ manager_id: string }>(
        "select manager_id from public.roster_slots where league_id = $1 and couple_id = $2 and end_week is null", [tieLeague, couple])).rows[0]?.manager_id;

    // Friend holds B and drops it for D. Admin and Third both want B for an
    // open spot, and Admin is ahead of Friend, so their turn comes before B
    // is free: it still goes to Admin, not to Third after Friend.
    await db.query("insert into public.roster_slots(league_id, manager_id, slot_number, couple_id, source, start_week) values ($1, $2, 1, $3, 'draft', 1)", [tieLeague, friend, b]);
    await claim(admin, b, null, 11);
    await claim(friend, d, b, 11);
    await claim(third, b, null, 11);
    expect(await run(11, [admin, friend, third])).toBe(2);
    expect(await results(11)).toEqual([[admin, "awarded"], [friend, "awarded"], [third, "taken"]]);
    expect(await holderOf(b)).toBe(admin);

    // Two managers each waiting on the other's drop both lose.
    await claim(admin, d, b, 12);
    await claim(friend, b, d, 12);
    expect(await run(12, [admin, friend, third])).toBe(0);
    expect(await results(12)).toEqual([[admin, "taken"], [friend, "taken"]]);
    expect(await holderOf(b)).toBe(admin);
  });

  it("keeps saved lists in their order when the migration is applied again", async () => {
    await asService();
    // The first choice has the later id: renumbering by age would swap them.
    await db.query(`insert into public.waiver_claims(id, league_id, couple_id, manager_id, slot_number, week_number, priority_order) values
      ($1, $3, $4, $6, 1, 13, 1), ($2, $3, $5, $6, 1, 13, 2)`, [id(91), id(90), tieLeague, h, i, third]);
    await db.exec(readFileSync("supabase/apply-recast-v2.sql", "utf8"));
    expect((await db.query("select couple_id, priority_order from public.waiver_claims where status = 'pending' order by priority_order")).rows)
      .toEqual([{ couple_id: h, priority_order: 1 }, { couple_id: i, priority_order: 2 }]);
  });
});
