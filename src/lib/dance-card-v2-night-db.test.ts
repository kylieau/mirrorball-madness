import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { coupleValueCents, danceCardV2Rule } from "./dance-card-v2";
import { danceCardDifferences, danceCardRowsFromLive, type DanceCardSnapshot } from "./dance-card-refresh";
import { buildPublicationPlan, type PublicationSnapshot } from "./episode-publication";
import { buildRevealPlan, buildTeamRevealPlan } from "./episode-reveal";

// A Grammy Night (E10) shaped week on a v2 league: own dances posted one by
// one with an undo, a Winner's Bonus Dance-Off heat whose bonus is set on
// air, the immune couple's bonus row, then Finish Week.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1), friend = id(2);
const season = id(4), league = id(7), rumba = id(9);
const [week8, week9] = [id(10), id(11)];
const [e09, e10] = [id(13), id(14)];
const judges = [id(20), id(21), id(22)];
const [harry, jenna, ezra, amber] = [id(30), id(31), id(32), id(33)];
const cast = [harry, jenna, ezra, amber];
const rule = danceCardV2Rule(2);
const credit = (before: number, after: number) => (coupleValueCents(after, rule) - coupleValueCents(before, rule)) / 100;

const LIVE_STACK = [
  "apply-audit-security", "apply-audit-deadlines", "apply-audit-settings", "apply-audit-prediction-provenance",
  "apply-curtain-call-backfill", "apply-curtain-call-backfill-lock-check", "apply-service-role-season-grants",
  "apply-drop-curtain-call-lock-guard", "apply-team-dance-entity", "apply-special-dances", "apply-special-dances-polish",
  "apply-draft-release-own-rows", "apply-whole-judge-marks", "apply-special-draft-release",
  "apply-contributor-special-setup", "apply-draft-lineup", "apply-retire-special-leftovers", "apply-episode-rounds",
  "apply-special-dance-label", "apply-dance-card-v2",
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
    insert into auth.users(id, email) values ('${admin}', 'admin@example.test'), ('${friend}', 'friend@example.test');
    update public.profiles set is_super_admin = true where id = '${admin}';
    update public.profiles set can_propose_results = true where id = '${friend}';
    insert into public.seasons(id, name, is_active) values ('${season}', 'S35', true);
    insert into public.competition_weeks(id, season_id, week_number) values ('${week8}', '${season}', 8), ('${week9}', '${season}', 9);
    insert into public.episodes(id, season_id, week_id, episode_number, airs_at, expected_dance_count) values
      ('${e09}', '${season}', '${week8}', 9, now() - interval '7 days', 1),
      ('${e10}', '${season}', '${week9}', 10, now() - interval '1 hour', 1);
    insert into public.people(id, name, role) values
      ('${judges[0]}', 'Carrie Ann Inaba', 'judge'), ('${judges[1]}', 'Derek Hough', 'judge'), ('${judges[2]}', 'Bruno Tonioli', 'judge');
    insert into public.people(id, name, role) select ('00000000-0000-4000-8000-' || lpad((40 + n)::text, 12, '0'))::uuid, 'Celebrity ' || n, 'celebrity' from generate_series(0, 3) n;
    insert into public.people(id, name, role) select ('00000000-0000-4000-8000-' || lpad((50 + n)::text, 12, '0'))::uuid, 'Pro ' || n, 'pro' from generate_series(0, 3) n;
    insert into public.couples(id, season_id, celebrity_id, pro_id)
      select ('00000000-0000-4000-8000-' || lpad((30 + n)::text, 12, '0'))::uuid, '${season}',
             ('00000000-0000-4000-8000-' || lpad((40 + n)::text, 12, '0'))::uuid, ('00000000-0000-4000-8000-' || lpad((50 + n)::text, 12, '0'))::uuid
      from generate_series(0, 3) n;
    insert into public.leagues(id, name, invite_code, commissioner_id, roster_size) values ('${league}', 'Curve', 'CURVE', '${admin}', 2);
    insert into public.league_members(league_id, user_id, role) values ('${league}', '${admin}', 'commissioner'), ('${league}', '${friend}', 'manager');
    insert into public.scoring_settings(league_id, judges_score_multiplier, survival_points, judges_score_starts_week) values ('${league}', 0.2449, 1.56, 8);
    insert into public.roster_slots(league_id, manager_id, slot_number, couple_id, source, start_week) values
      ('${league}', '${admin}', 1, '${amber}', 'draft', 1), ('${league}', '${admin}', 2, '${harry}', 'draft', 1),
      ('${league}', '${friend}', 1, '${ezra}', 'draft', 1), ('${league}', '${friend}', 2, '${jenna}', 'draft', 1);`);
}, 120000);
afterAll(async () => db?.close());

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
async function danceCardSnapshot(): Promise<DanceCardSnapshot> {
  return (await db.query<{ s: DanceCardSnapshot }>("select public.dance_card_snapshot() as s")).rows[0].s;
}
async function finishWeek(episode: string) {
  const data = await snapshot(episode);
  await db.query("select public.commit_episode_publication_with_later_weeks($1, $2, $3, $4)", [episode, admin, JSON.stringify(data), JSON.stringify(buildPublicationPlan(data, episode))]);
}
async function postCouple(couple: string, undo = false) {
  const data = await snapshot(e10);
  await db.query("select public.commit_episode_reveal($1, $2, $3, $4, $5, $6)",
    [e10, couple, admin, JSON.stringify(data), JSON.stringify(buildRevealPlan(data, e10, couple, undo)), undo]);
}
async function postSpecial(teamId: string, undo = false) {
  const data = await snapshot(e10);
  await db.query("select public.commit_team_reveal($1, $2, $3, $4, $5, $6)",
    [e10, teamId, admin, JSON.stringify(data), JSON.stringify(buildTeamRevealPlan(data, e10, teamId, undo)), undo]);
}
async function setPoints(rows: unknown, version: string | null, migrationId: string | null) {
  await db.query("select public.set_dance_card_points($1, $2, $3, $4, $5, $6)",
    [admin, league, (await danceCardSnapshot())._revision, version, migrationId, JSON.stringify(rows)]);
}
const roster = async (managerId: string, weekId: string) =>
  (await db.query<{ p: number }>("select roster_points::float as p from public.weekly_manager_scores where manager_id = $1 and week_id = $2", [managerId, weekId])).rows[0]?.p ?? 0;
const heats = async (roundId: string) =>
  (await db.query<{ id: string; heat: number | null }>("select id, heat_number as heat from public.episode_teams where round_id = $1 order by heat_number nulls last", [roundId])).rows;

describe("an E10-shaped night on a Dance Card v2 league", () => {
  it("posts, undoes, takes the on-air bonus, finishes the week, and matches a rebuild from live", async () => {
    // Week 8 published on v1, then the league switches to v2.
    await ownDances(e09, cast);
    await finishWeek(e09);
    await setPoints(danceCardRowsFromLive(await danceCardSnapshot(), league, "v2"), "v2", id(90));
    expect(await roster(admin, week8)).toBe(credit(0, 24) * 2);

    // Grammy Night's plan: Round 1, then a Winner's Bonus Dance-Off; Harry immune.
    const round1 = (await db.query<{ id: string }>("select id from public.episode_rounds where episode_id = $1 and position = 1", [e10])).rows[0]?.id;
    const roundIds = (await db.query<{ ids: string[] }>("select public.save_episode_rounds($1, $2, $3) as ids", [e10, admin, JSON.stringify([
      { ...(round1 ? { id: round1 } : {}), kind: "own", roundType: "Individual Dance" },
      { kind: "special", roundType: "Dance-Off", scoring: "fixed_bonus", unitCount: 1, heats: [{ heatNumber: 1, coupleIds: [amber, ezra] }] },
    ])])).rows[0].ids;
    const danceOff = roundIds[1];
    await db.query("select public.save_round_exception($1, $2, $3, $4, $5, $6, $7)", [e10, friend, harry, [danceOff], "immune", null, null]);
    const [heat, immunity] = await heats(danceOff);
    expect(immunity.heat).toBeNull();

    // Own dances post one by one; each post stores the whole week's credit.
    await ownDances(e10, cast);
    await postCouple(amber);
    expect(await roster(admin, week9)).toBe(credit(24, 48));
    await postCouple(harry);
    await postCouple(ezra);
    await postCouple(jenna);
    await postCouple(jenna, true);
    expect(await roster(friend, week9)).toBe(credit(24, 48));
    await postCouple(jenna);

    // No switching back mid-night.
    await expect(setPoints(danceCardRowsFromLive(await danceCardSnapshot(), league, "v2"), null, null)).resolves.toBeUndefined();
    await expect(setPoints([], "v1", id(91))).rejects.toThrow(/Scores are posting/);

    // The heat is called, then the bonus is announced on air.
    await db.query("select public.save_special_dance_points($1, $2, $3, $4)", [e10, heat.id, friend,
      JSON.stringify([{ coupleId: amber, points: null, result: "Winner" }, { coupleId: ezra, points: 0, result: "Loser" }])]);
    await db.query("select public.set_round_bonus($1, $2, $3, $4)", [e10, friend, danceOff, 3]);
    await postSpecial(heat.id);
    await postSpecial(immunity.id);
    // Amber (24 + 3) and Harry (24 + 3 immune) are each a 27 night; Ezra's 0 adds nothing.
    expect(await roster(admin, week9)).toBe(Math.round((credit(24, 51) * 2) * 100) / 100);
    expect(await roster(friend, week9)).toBe(credit(24, 48) * 2);
    await postSpecial(heat.id, true);
    expect(await roster(admin, week9)).toBe(Math.round((credit(24, 48) + credit(24, 51)) * 100) / 100);
    await postSpecial(heat.id);

    await finishWeek(e10);
    expect(await roster(admin, week9)).toBe(Math.round((credit(24, 51) * 2) * 100) / 100);
    expect(await roster(friend, week9)).toBe(credit(24, 48) * 2);
    const live = await danceCardSnapshot();
    expect(danceCardDifferences(live.weeklyScores, danceCardRowsFromLive(live, league, "v2"))).toEqual([]);
  });
});
