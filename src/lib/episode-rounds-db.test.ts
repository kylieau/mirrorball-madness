import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRevealPlan, buildTeamRevealPlan } from "./episode-reveal";
import { buildPublicationPlan, type PublicationSnapshot } from "./episode-publication";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1), friend = id(2), outsider = id(3);
const season = id(4), league = id(7), freestyle = id(8), rumba = id(9);
const [week8, week9, week10] = [id(10), id(11), id(12)];
const [e09, e10, e11] = [id(13), id(14), id(15)];
const judges = [id(20), id(21), id(22)];
// Harry, Jenna D., Ezra, Connor, Amber, Tatyana, Maura.
const [harry, jenna, ezra, connor, amber, tatyana, maura] = [id(30), id(31), id(32), id(33), id(34), id(35), id(36)];
const cast = [harry, jenna, ezra, connor, amber, tatyana, maura];
let db: PGlite;
let wildcats: string, slaytopia: string;

// The files applied live, in order (see retire-special-leftovers-db.test.ts).
const LIVE_STACK = [
  "apply-audit-security", "apply-audit-deadlines", "apply-audit-settings", "apply-audit-prediction-provenance",
  "apply-curtain-call-backfill", "apply-curtain-call-backfill-lock-check", "apply-service-role-season-grants",
  "apply-drop-curtain-call-lock-guard", "apply-team-dance-entity", "apply-special-dances", "apply-special-dances-polish",
  "apply-draft-release-own-rows", "apply-whole-judge-marks", "apply-special-draft-release",
  "apply-contributor-special-setup", "apply-draft-lineup", "apply-retire-special-leftovers",
];
const roundsSql = readFileSync("supabase/apply-episode-rounds.sql", "utf8");

async function freshDb() {
  const instance = new PGlite();
  await instance.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;`);
  await instance.exec(
    readFileSync("supabase/schema.sql", "utf8")
      .replace('create extension if not exists "pgcrypto";', "")
      .replace(/alter publication supabase_realtime add table [^;]+;/g, "")
  );
  for (const file of LIVE_STACK) await instance.exec(readFileSync(`supabase/${file}.sql`, "utf8"));
  return instance;
}

async function seed() {
  await db.exec(`truncate public.dance_styles cascade;
    insert into public.dance_styles(id, name, category) values ('${freestyle}', 'Freestyle', 'show'), ('${rumba}', 'Rumba', 'latin');
    insert into auth.users(id, email) values ('${admin}', 'admin@example.test'), ('${friend}', 'friend@example.test'), ('${outsider}', 'outsider@example.test');
    update public.profiles set is_super_admin = true where id = '${admin}';
    update public.profiles set can_propose_results = true where id = '${friend}';
    insert into public.seasons(id, name, is_active) values ('${season}', 'S35', true);
    insert into public.competition_weeks(id, season_id, week_number) values ('${week8}', '${season}', 8), ('${week9}', '${season}', 9), ('${week10}', '${season}', 10);
    insert into public.episodes(id, season_id, week_id, episode_number, airs_at, expected_dance_count) values
      ('${e09}', '${season}', '${week8}', 9, now() - interval '3 days', 1),
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
    insert into public.round_types(name) values ('Team Dance'), ('Instant Dance') on conflict (name) do nothing;
    insert into public.leagues(id, name, invite_code, commissioner_id) values ('${league}', 'Test', 'TEST', '${admin}');
    insert into public.league_members(league_id, user_id, role) values ('${league}', '${admin}', 'commissioner'), ('${league}', '${friend}', 'manager');
    insert into public.scoring_settings(league_id, judges_score_multiplier, survival_points) values ('${league}', 1, 0);
    insert into public.roster_slots(league_id, manager_id, slot_number, couple_id, source, start_week) values
      ('${league}', '${admin}', 1, '${amber}', 'draft', 1), ('${league}', '${friend}', 1, '${harry}', 'draft', 1);`);
}

async function saveSpecial(episode: string, dance: Record<string, unknown>, actor = admin): Promise<string> {
  return (await db.query<{ id: string }>("select public.save_special_dance($1, $2, $3) as id", [episode, actor, JSON.stringify(dance)])).rows[0].id;
}
async function saveRounds(episode: string, rounds: unknown[], actor = admin): Promise<string[]> {
  return (await db.query<{ ids: string[] }>("select public.save_episode_rounds($1, $2, $3) as ids", [episode, actor, JSON.stringify(rounds)])).rows[0].ids;
}
async function rounds(episode: string) {
  return (await db.query<{ id: string; position: number; kind: string; round_type: string; scoring: string; unit_count: number; bonus: number | null }>(
    "select id, position, kind, round_type, scoring, unit_count, bonus_points::float as bonus from public.episode_rounds where episode_id = $1 order by position", [episode])).rows;
}
async function heats(roundId: string) {
  return (await db.query<{ id: string; name: string; heat: number | null; mode: string; members: string[] }>(
    `select t.id, t.name, t.heat_number as heat, t.scoring_mode as mode,
       coalesce((select array_agg(m.couple_id order by m.sort_order) from public.episode_team_members m where m.team_id = t.id), '{}') as members
     from public.episode_teams t where t.round_id = $1 order by t.heat_number nulls last`, [roundId])).rows;
}
async function exception(episode: string, couple: string, roundIds: string[], kind: string | null, opts: { note?: string; bonus?: number; actor?: string } = {}) {
  await db.query("select public.save_round_exception($1, $2, $3, $4, $5, $6, $7)",
    [episode, opts.actor ?? friend, couple, roundIds, kind, opts.note ?? null, opts.bonus ?? null]);
}
async function setBonus(episode: string, roundId: string, bonus: number | null) {
  await db.query("select public.set_round_bonus($1, $2, $3, $4)", [episode, friend, roundId, bonus]);
}
async function savePoints(episode: string, teamId: string, scores: { coupleId: string; points: number | null; result: string | null }[]) {
  await db.query("select public.save_special_dance_points($1, $2, $3, $4)", [episode, teamId, friend, JSON.stringify(scores)]);
}
async function coupleMarks(episode: string, teamId: string, coupleId: string, scores: number[]) {
  await db.query("select public.save_team_couple_marks($1, $2, $3, $4, $5)",
    [episode, teamId, friend, coupleId, JSON.stringify(scores.map((score, i) => ({ judgeId: judges[i], score })))]);
}
async function outcome(episode: string, couple: string) {
  return (await db.query<{ outcome: string; had_immunity: boolean }>(
    "select outcome, had_immunity from public.draft_episode_results where episode_id = $1 and couple_id = $2", [episode, couple])).rows[0] ?? null;
}
async function ownDances(episode: string, couples: string[]) {
  const entries = couples.map((coupleId) => ({
    coupleId, outcome: "safe", savedByJudges: false, hadImmunity: false, bonusPoints: 0, bonusNote: null,
    dances: [{ danceStyleId: rumba, songTitle: "Song", judgeScores: [8, 8, 8].map((score, j) => ({ judgeId: judges[j], score })) }],
  }));
  await db.query("select public.save_episode_draft_checked($1)", [
    JSON.stringify({ episodeId: episode, updatedBy: friend, guestJudgeName: null, judgesSaveAvailable: false, inJeopardyCoupleIds: [], entries, correctionToken: null }),
  ]);
}
async function snapshot(episode: string): Promise<PublicationSnapshot> {
  return (await db.query<{ data: PublicationSnapshot }>("select public.episode_publication_snapshot($1) as data", [episode])).rows[0].data;
}
async function finishWeek(episode: string) {
  const data = await snapshot(episode);
  await db.query("select public.commit_episode_publication($1, $2, $3, $4)", [episode, admin, JSON.stringify(data), JSON.stringify(buildPublicationPlan(data, episode))]);
}
// The fan read on draft nights, as a signed-in viewer who unlocked drafts.
async function unlockDrafts(weekNumber: number) {
  await db.query(
    `insert into public.spoiler_watch_progress(user_id, season_id, last_watched_week, draft_unlocked_week) values ($1, $2, $3, $3)
     on conflict (user_id, season_id) do update set last_watched_week = excluded.last_watched_week, draft_unlocked_week = excluded.draft_unlocked_week`,
    [outsider, season, weekNumber]
  );
}
async function visibleDrafts() {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [outsider]);
  await db.exec("set role authenticated");
  try {
    return (await db.query(
      `select team_id, couple_id, total_score::float as total, scaled_score::float as scaled, max_score::float as max
       from public.visible_draft_special_scores() order by team_id, couple_id`)).rows;
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}
async function liveTeamRows(episode: string, teamId: string) {
  return (await db.query<{ couple_id: string; total: number; scaled: number; max: number; judges: number }>(
    `select d.couple_id, d.total_score::float as total, d.scaled_score::float as scaled, d.max_score::float as max,
       (select count(*) from public.judge_scores j where j.dance_score_id = d.id)::int as judges
     from public.dance_scores d where d.episode_id = $1 and d.team_id = $2 order by d.couple_id`, [episode, teamId])).rows;
}

describe("apply-episode-rounds.sql", () => {
  beforeAll(async () => {
    db = await freshDb();
    await seed();
    // E09 as it is live: two posted Team Dance teams, Wildcats first.
    wildcats = await saveSpecial(e09, { danceType: "Team Dance", name: "Wildcats", memberCoupleIds: [harry, jenna, ezra, connor], sortOrder: 1 });
    slaytopia = await saveSpecial(e09, { danceType: "Team Dance", name: "Slaytopia", memberCoupleIds: [amber, tatyana, maura], sortOrder: 2 });
    await db.exec(`insert into public.episode_team_marks(team_id, judge_id, score)
      select t, j, 10 from unnest(array['${wildcats}', '${slaytopia}']::uuid[]) t, unnest(array['${judges.join("','")}']::uuid[]) j;
      update public.episode_teams set posted_at = now() where episode_id = '${e09}';
      insert into public.dance_scores(episode_id, couple_id, dance_style_id, total_score, scaled_score, max_score, team_id)
      select '${e09}', m.couple_id, '${freestyle}', 30, 30, 30, m.team_id from public.episode_team_members m where m.episode_id = '${e09}';
      update public.episodes set results_published_at = now(), status = 'completed' where id = '${e09}';
      insert into public.episode_round_types(episode_id, round_type_id) select '${e09}', id from public.round_types where name = 'Team Dance';`);
    // E10 as it is live: three auto-named Dance-Offs in marks mode, unscored,
    // created out of name order and all at sort order 0.
    for (const [members, name] of [[[connor, maura], "Dance-Off 3"], [[amber, ezra], ""], [[jenna, tatyana], "Dance-Off 2"]] as const) {
      const teamId = await saveSpecial(e10, { danceType: "Dance-Off", name, memberCoupleIds: members, sortOrder: 0 }, friend);
      await db.query("update public.episode_teams set name_is_auto = true where id = $1", [teamId]);
    }
    // Harry & Jenna's bonus entered by hand as a one-couple Points special.
    const handMade = await saveSpecial(e10, { danceType: "Immunity", memberCoupleIds: [harry], scoringMode: "points" }, friend);
    await savePoints(e10, handMade, [{ coupleId: harry, points: 3, result: "Immune" }]);
    await db.exec(roundsSql);
    await db.exec(roundsSql); // Dashboard reruns must be safe.
  }, 60_000);
  afterAll(async () => db?.close());

  it("backfills E09 as Round 1 plus a Team Dance round with its 2 teams, scores untouched", async () => {
    const plan = await rounds(e09);
    expect(plan.map((r) => [r.position, r.kind, r.round_type, r.scoring, r.unit_count])).toEqual([
      [1, "own", "Individual Dance", "marks", 0],
      [2, "special", "Team Dance", "team_marks", 2],
    ]);
    expect((await heats(plan[1].id)).map((h) => [h.name, h.heat, h.mode])).toEqual([["Wildcats", 1, "marks"], ["Slaytopia", 2, "marks"]]);
    expect((await db.query("select count(*)::int as n from public.dance_scores where episode_id = $1", [e09])).rows[0]).toEqual({ n: 7 });
  });

  it("backfills E10 as Round 1 plus one Dance-Off round of 3 heats by the winner's bonus, Dance-Off renamed Dance-Off 1", async () => {
    const plan = await rounds(e10);
    expect(plan.map((r) => [r.kind, r.round_type, r.scoring, r.unit_count, r.bonus])).toEqual([
      ["own", "Individual Dance", "marks", 0, null],
      ["special", "Dance-Off", "fixed_bonus", 3, null],
    ]);
    expect((await heats(plan[1].id)).map((h) => [h.name, h.heat, h.mode, h.members])).toEqual([
      ["Dance-Off 1", 1, "points", [amber, ezra]],
      ["Dance-Off 2", 2, "points", [jenna, tatyana]],
      ["Dance-Off 3", 3, "points", [connor, maura]],
      // The hand-made Immunity special is the round's immunity row, not a round of its own.
      ["Immunity", null, "points", [harry]],
    ]);
    expect((await db.query("select kind, bonus_points::float as bonus from public.episode_round_exceptions where round_id = $1 and couple_id = $2", [plan[1].id, harry])).rows)
      .toEqual([{ kind: "immune", bonus: 3 }]);
    expect((await rounds(e11)).map((r) => r.round_type)).toEqual(["Individual Dance"]);
    const verify = (await db.query<{ result: Record<string, unknown> }>(readFileSync("supabase/queries/verify-episode-rounds.sql", "utf8"))).rows[0].result;
    expect(verify).toMatchObject({ tables: 3, columns: 2, functions: 12, episodes_without_plan: 0 });
    expect((verify.plans as { episode: number; type: string }[]).map((p) => [p.episode, p.type])).toEqual([
      [9, "Individual Dance"], [9, "Team Dance"], [10, "Individual Dance"], [10, "Dance-Off"],
    ]);
  });

  it("keeps the plan admin only and Round 1 fixed", async () => {
    await expect(saveRounds(e11, [{ kind: "own", roundType: "Individual Dance" }], friend)).rejects.toThrow(/Only a site admin/);
    await expect(saveRounds(e11, [{ kind: "special", roundType: "Dance-Off", scoring: "fixed_bonus" }])).rejects.toThrow(/Round 1 is always/);
    await expect(saveRounds(e11, [{ kind: "own", roundType: "Individual Dance" }, { kind: "special", roundType: "Trio" }])).rejects.toThrow(/Pick how Trio is scored/);
  });

  it("plans rounds, creates and re-pairs heats, renumbers them, and follows with the dance count and Round Types", async () => {
    const [r1] = await rounds(e11);
    const ids = await saveRounds(e11, [
      { id: r1.id, kind: "own", roundType: "Individual Dance" },
      { kind: "own", roundType: "Instant Dance" },
      { kind: "special", roundType: "Dance-Off", scoring: "fixed_bonus", unitCount: 3, bonusPoints: 3,
        heats: [{ heatNumber: 1, coupleIds: [amber, ezra] }, { heatNumber: 2, coupleIds: [jenna, tatyana] }] },
      { kind: "special", roundType: "Team Dance", scoring: "team_marks", unitCount: 2 },
      { kind: "none", roundType: "Judges' Save" },
    ]);
    expect(ids).toHaveLength(5);
    expect((await db.query("select expected_dance_count from public.episodes where id = $1", [e11])).rows[0]).toEqual({ expected_dance_count: 2 });
    expect((await db.query("select r.name from public.episode_round_types e join public.round_types r on r.id = e.round_type_id where e.episode_id = $1 order by 1", [e11])).rows)
      .toEqual([{ name: "Instant Dance" }, { name: "Team Dance" }]);
    expect((await heats(ids[2])).map((h) => [h.name, h.heat, h.mode, h.members])).toEqual([
      ["Dance-Off 1", 1, "points", [amber, ezra]],
      ["Dance-Off 2", 2, "points", [jenna, tatyana]],
    ]);
    expect(await heats(ids[3])).toEqual([]);
    // A contributor sets up the third heat on Enter Results; it takes its planned name.
    const third = await saveSpecial(e11, { danceType: "Dance-Off", name: "", memberCoupleIds: [connor, maura], scoringMode: "points", roundId: ids[2], heatNumber: 3 }, friend);
    expect((await heats(ids[2])).find((h) => h.id === third)).toMatchObject({ name: "Dance-Off 3", heat: 3 });
    await expect(saveSpecial(e11, { danceType: "Dance-Off", memberCoupleIds: [harry], roundId: ids[2], heatNumber: 3 }, friend)).rejects.toThrow(/Dance-Off 3 is already set up/);
    await db.query("select public.delete_special_dance($1, $2, $3)", [e11, third, admin]);

    // Re-pair heat 2, pair heat 3; then a scored heat refuses to go.
    const plan = (heatsList: unknown[], unitCount = 3) => [
      { id: ids[0], kind: "own", roundType: "Individual Dance" },
      { id: ids[2], kind: "special", roundType: "Dance-Off", scoring: "fixed_bonus", unitCount, bonusPoints: 3, heats: heatsList },
    ];
    await saveRounds(e11, plan([{ heatNumber: 1, coupleIds: [amber, ezra] }, { heatNumber: 2, coupleIds: [jenna, maura] }, { heatNumber: 3, coupleIds: [connor, tatyana] }]));
    expect((await rounds(e11)).map((r) => r.round_type)).toEqual(["Individual Dance", "Dance-Off"]);
    expect((await db.query("select expected_dance_count from public.episodes where id = $1", [e11])).rows[0]).toEqual({ expected_dance_count: 1 });
    const [h1, , h3] = await heats(ids[2]);
    expect((await heats(ids[2])).map((h) => h.members)).toEqual([[amber, ezra], [jenna, maura], [connor, tatyana]]);
    await savePoints(e11, h3.id, [{ coupleId: connor, points: 3, result: "Winner" }]);
    await expect(saveRounds(e11, plan([], 2))).rejects.toThrow(/Dance-Off 3 already has scores/);
    await savePoints(e11, h3.id, [{ coupleId: connor, points: null, result: null }]);
    await saveRounds(e11, plan([{ heatNumber: 1, coupleIds: [amber, ezra] }], 1));
    expect((await heats(ids[2])).map((h) => [h.id, h.name, h.heat])).toEqual([[h1.id, "Dance-Off", 1]]);
  });

  it("marks exceptions: immune bonus follows the round, Not Dancing and Withdrawn set the outcome and leave heats", async () => {
    const [round1, danceOff] = await rounds(e10);
    const [heat1, heat2, heat3] = await heats(danceOff.id);
    await ownDances(e10, cast);
    await exception(e10, harry, [danceOff.id], "immune", { note: "Top of Disney Night" });
    expect(await outcome(e10, harry)).toEqual({ outcome: "safe", had_immunity: true });
    const immunity = (await heats(danceOff.id)).find((h) => h.heat === null)!;
    expect(immunity).toMatchObject({ name: "Dance-Off Immunity", mode: "points", members: [harry] });
    // Marked again without a bonus of their own, Harry follows the round's bonus, still unknown.
    // No bonus yet: the immunity row is blank and holds Finish Week.
    expect((await db.query("select public.special_dance_blocker($1, 'before finishing the week') as b", [immunity.id])).rows[0]).toEqual({
      b: "Dance-Off Immunity has points for 0 of 1 couples. Enter every couple's points or remove it before finishing the week.",
    });

    // A winner picked before the bonus is announced takes it when it is.
    await savePoints(e10, heat1.id, [{ coupleId: amber, points: null, result: "Winner" }, { coupleId: ezra, points: 0, result: "Loser" }]);
    await setBonus(e10, danceOff.id, 3);
    const points = async (teamId: string, coupleId: string) =>
      (await db.query<{ p: number | null }>("select points::float as p from public.episode_team_scores where team_id = $1 and couple_id = $2", [teamId, coupleId])).rows[0]?.p;
    expect(await points(heat1.id, amber)).toBe(3);
    expect(await points(immunity.id, harry)).toBe(3);
    await exception(e10, harry, [danceOff.id], "immune", { bonus: 2 });
    expect(await points(immunity.id, harry)).toBe(2);
    await exception(e10, harry, [danceOff.id], "immune");
    expect(await points(immunity.id, harry)).toBe(3);

    // Not Dancing in every round: out of their heat, Did Not Dance; undo is Safe again.
    await exception(e10, connor, [round1.id, danceOff.id], "not_dancing", { note: "Injured in rehearsal" });
    expect(await outcome(e10, connor)).toEqual({ outcome: "bye", had_immunity: false });
    expect((await heats(danceOff.id)).find((h) => h.id === heat3.id)?.members).toEqual([maura]);
    await exception(e10, connor, [round1.id, danceOff.id], null);
    expect((await outcome(e10, connor))?.outcome).toBe("safe");
    // Not Dancing in one round only leaves the outcome alone.
    await exception(e10, connor, [round1.id], "not_dancing");
    expect((await outcome(e10, connor))?.outcome).toBe("safe");
    await exception(e10, connor, [round1.id], null);

    // Withdrawn spans the night from one round, and clears the same way.
    await exception(e10, tatyana, [round1.id], "withdrawn");
    expect((await db.query("select count(*)::int as n from public.episode_round_exceptions where couple_id = $1", [tatyana])).rows[0]).toEqual({ n: 2 });
    expect((await outcome(e10, tatyana))?.outcome).toBe("withdrawn");
    expect((await heats(danceOff.id)).find((h) => h.id === heat2.id)?.members).toEqual([jenna]);
    await exception(e10, tatyana, [danceOff.id], null);
    expect((await db.query("select count(*)::int as n from public.episode_round_exceptions where couple_id = $1", [tatyana])).rows[0]).toEqual({ n: 0 });
    expect((await outcome(e10, tatyana))?.outcome).toBe("safe");

    await expect(exception(e10, jenna, [round1.id], "immune")).rejects.toThrow(/special round/);
    await expect(exception(e10, jenna, [danceOff.id], "immune", { actor: outsider })).rejects.toThrow(/Not authorized/);
    await expect(setBonus(e10, round1.id, 3)).rejects.toThrow(/winner's bonus/);
  });

  it("shows fans who unlocked drafts a released bonus heat as points", async () => {
    const [, danceOff] = await rounds(e10);
    const [heat1] = await heats(danceOff.id);
    await db.query("select public.set_special_draft_release($1, $2, $3, true)", [e10, heat1.id, friend]);
    await unlockDrafts(9);
    expect(await visibleDrafts()).toEqual([
      { team_id: heat1.id, couple_id: ezra, total: 0, scaled: 0, max: 0 },
      { team_id: heat1.id, couple_id: amber, total: 3, scaled: 0, max: 0 },
    ]);
    await db.query("select public.set_special_draft_release($1, $2, $3, false)", [e10, heat1.id, friend]);
  });

  it("finishes Grammy Night: winners' bonus, losers 0 and the immune couple's bonus add to the night", async () => {
    const [, danceOff] = await rounds(e10);
    const [heat1, heat2, heat3] = await heats(danceOff.id);
    await saveSpecial(e10, { id: heat2.id, memberCoupleIds: [jenna, tatyana] }, friend);
    await saveSpecial(e10, { id: heat3.id, memberCoupleIds: [connor, maura] }, friend);
    await savePoints(e10, heat2.id, [{ coupleId: jenna, points: 0, result: "Loser" }, { coupleId: tatyana, points: 3, result: "Winner" }]);
    await savePoints(e10, heat3.id, [{ coupleId: connor, points: 0, result: "Loser" }, { coupleId: maura, points: 3, result: "Winner" }]);
    await ownDances(e10, cast);
    await finishWeek(e10);
    expect((await liveTeamRows(e10, heat1.id)).map((r) => [r.couple_id, r.total, r.max])).toEqual([[ezra, 0, 0], [amber, 3, 0]]);
    const immunity = (await heats(danceOff.id)).find((h) => h.heat === null)!;
    expect((await liveTeamRows(e10, immunity.id)).map((r) => [r.couple_id, r.total, r.max])).toEqual([[harry, 3, 0]]);
    const roster = async (managerId: string) =>
      (await db.query<{ p: number }>("select roster_points::float as p from public.weekly_manager_scores where manager_id = $1 and week_id = $2", [managerId, week9])).rows[0]?.p;
    // Amber 24/30 + 3 and Harry 24/30 + 3 (immune) are both 27.
    expect(await roster(admin)).toBe(27);
    expect(await roster(friend)).toBe(27);
  });

  it("scores a heat couple by couple, posts it on its own, and refuses an older plan", async () => {
    await db.exec(`update public.episodes set airs_at = now() - interval '1 hour' where id = '${e11}'`);
    const [r1] = await rounds(e11);
    const ids = await saveRounds(e11, [
      { id: r1.id, kind: "own", roundType: "Individual Dance" },
      { kind: "special", roundType: "Face-Off", scoring: "couple_marks", unitCount: 1, heats: [{ heatNumber: 1, coupleIds: [amber, ezra] }] },
    ]);
    const [heat] = await heats(ids[1]);
    expect(heat).toMatchObject({ name: "Face-Off", mode: "couple_marks", members: [amber, ezra] });
    await coupleMarks(e11, heat.id, amber, [9, 9]);
    expect((await db.query("select public.special_dance_blocker($1, 'first') as b", [heat.id])).rows[0]).toEqual({ b: "Face-Off has 2 of 6 marks. Score it or remove it first." });
    await expect(coupleMarks(e11, heat.id, harry, [9, 9, 9])).rejects.toThrow(/participants/);
    await expect(coupleMarks(e11, heat.id, amber, [0, 9, 9])).rejects.toThrow(/whole numbers from 1 to 10/);
    await expect(db.query("select public.save_team_marks($1, $2, $3, '[]')", [e11, heat.id, friend])).rejects.toThrow(/scored in points|not judges/);
    await coupleMarks(e11, heat.id, amber, [9, 9, 10]);
    await coupleMarks(e11, heat.id, ezra, [7, 8, 8]);
    expect((await db.query("select public.special_dance_complete($1) as c", [heat.id])).rows[0]).toEqual({ c: true });
    await ownDances(e11, cast);
    await db.query("select public.set_special_draft_release($1, $2, $3, true)", [e11, heat.id, friend]);
    await unlockDrafts(10);
    expect(await visibleDrafts()).toEqual([
      { team_id: heat.id, couple_id: ezra, total: 23, scaled: 23, max: 30 },
      { team_id: heat.id, couple_id: amber, total: 28, scaled: 28, max: 30 },
    ]);

    const data = await snapshot(e11);
    expect(data.teamCoupleMarks).toHaveLength(6);
    const older = { ...buildPublicationPlan(data, e11), planVersion: 2 };
    await expect(db.query("select public.commit_episode_publication($1, $2, $3, $4)", [e11, admin, JSON.stringify(data), JSON.stringify(older)]))
      .rejects.toThrow(/each couple's marks/);

    const reveal = async (undo: boolean) => {
      const snap = await snapshot(e11);
      await db.query("select public.commit_team_reveal($1, $2, $3, $4, $5, $6)",
        [e11, heat.id, admin, JSON.stringify(snap), JSON.stringify(buildTeamRevealPlan(snap, e11, heat.id, undo)), undo]);
    };
    await reveal(false);
    expect(await liveTeamRows(e11, heat.id)).toEqual([
      { couple_id: ezra, total: 23, scaled: 23, max: 30, judges: 3 },
      { couple_id: amber, total: 28, scaled: 28, max: 30, judges: 3 },
    ]);
    await reveal(true);
    expect(await liveTeamRows(e11, heat.id)).toEqual([]);
    // Every couple posted on their own dance; Finish Week still installs the heat.
    for (const couple of cast) {
      const own = await snapshot(e11);
      await db.query("select public.commit_episode_reveal($1, $2, $3, $4, $5, false)",
        [e11, couple, admin, JSON.stringify(own), JSON.stringify(buildRevealPlan(own, e11, couple, false))]);
    }
    await finishWeek(e11);
    expect((await liveTeamRows(e11, heat.id)).map((r) => [r.couple_id, r.total])).toEqual([[ezra, 23], [amber, 28]]);
  });
});
