import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { coupleValueCents, danceCardV2Rule } from "./dance-card-v2";
import { danceCardDifferences, danceCardRowsFromLive, type DanceCardSnapshot } from "./dance-card-refresh";
import { buildPublicationPlan, type PublicationPlan, type PublicationSnapshot } from "./episode-publication";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1), friend = id(2);
const season = id(4), curve = id(5), flat = id(6), waltz = id(8);
const [w2, w3, w4] = [id(10), id(11), id(12)];
const [e2, e3, e4] = [id(13), id(14), id(15)];
const judges = [id(20), id(21), id(22)];
const [harry, giada] = [id(30), id(31)];
const migration = id(90);
const credit = (before: number, after: number) => {
  const rule = danceCardV2Rule(2);
  return (coupleValueCents(after, rule) - coupleValueCents(before, rule)) / 100;
};

// The files applied live, in order (see special-dance-label-db.test.ts).
const LIVE_STACK = [
  "apply-audit-security", "apply-audit-deadlines", "apply-audit-settings", "apply-audit-prediction-provenance",
  "apply-curtain-call-backfill", "apply-curtain-call-backfill-lock-check", "apply-service-role-season-grants",
  "apply-drop-curtain-call-lock-guard", "apply-team-dance-entity", "apply-special-dances", "apply-special-dances-polish",
  "apply-draft-release-own-rows", "apply-whole-judge-marks", "apply-special-draft-release",
  "apply-contributor-special-setup", "apply-draft-lineup", "apply-retire-special-leftovers", "apply-episode-rounds",
  "apply-special-dance-label", "apply-dance-card-v2", "apply-dance-card-v3",
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
}, 120000);

afterAll(async () => {
  await db?.close();
});

// Harry (held in both leagues) and Giada (the friend's, in the v2 league).
// Weeks 2–4 have one episode each; "curve" weighs Dance Card ×2.
beforeEach(async () => {
  await db.exec(`truncate public.seasons, public.leagues, auth.users, public.people, public.dance_styles, public.weekly_manager_scores_archive cascade;
    insert into public.dance_styles(id, name) values ('${waltz}', 'Waltz');
    insert into auth.users(id, email) values ('${admin}', 'admin@example.test'), ('${friend}', 'friend@example.test');
    update public.profiles set is_super_admin = true where id = '${admin}';
    insert into public.seasons(id, name, is_active) values ('${season}', 'S35', true);
    insert into public.competition_weeks(id, season_id, week_number) values ('${w2}', '${season}', 2), ('${w3}', '${season}', 3), ('${w4}', '${season}', 4);
    insert into public.episodes(id, season_id, week_id, episode_number, airs_at, expected_dance_count) values
      ('${e2}', '${season}', '${w2}', 2, now() - interval '14 days', 1),
      ('${e3}', '${season}', '${w3}', 3, now() - interval '7 days', 1),
      ('${e4}', '${season}', '${w4}', 4, now() - interval '1 day', 1);
    insert into public.people(id, name, role) values
      ('${judges[0]}', 'Carrie Ann Inaba', 'judge'), ('${judges[1]}', 'Derek Hough', 'judge'), ('${judges[2]}', 'Bruno Tonioli', 'judge'),
      ('${id(40)}', 'Harry Shum Jr.', 'celebrity'), ('${id(41)}', 'Giada De Laurentiis', 'celebrity'), ('${id(50)}', 'Jenna Johnson', 'pro'), ('${id(51)}', 'Alan Bersten', 'pro');
    insert into public.couples(id, season_id, celebrity_id, pro_id) values ('${harry}', '${season}', '${id(40)}', '${id(50)}'), ('${giada}', '${season}', '${id(41)}', '${id(51)}');
    insert into public.leagues(id, name, invite_code, commissioner_id, roster_size) values ('${curve}', 'Curve', 'CURVE', '${admin}', 2), ('${flat}', 'Flat', 'FLAT', '${admin}', 2);
    insert into public.league_members(league_id, user_id, role) values ('${curve}', '${admin}', 'commissioner'), ('${curve}', '${friend}', 'manager'), ('${flat}', '${admin}', 'commissioner');
    insert into public.scoring_settings(league_id, judges_score_multiplier, survival_points, judges_score_category_weight, judges_score_starts_week) values
      ('${curve}', 0.2449, 1.56, 2, 2), ('${flat}', 0.2449, 1.56, 1, 2);
    insert into public.roster_slots(league_id, manager_id, slot_number, couple_id, source, start_week) values
      ('${curve}', '${admin}', 1, '${harry}', 'draft', 1), ('${curve}', '${friend}', 1, '${giada}', 'draft', 1), ('${flat}', '${admin}', 1, '${harry}', 'draft', 1);`);
});

async function draft(episode: string, scores: Record<string, number[]>) {
  await db.query("insert into public.draft_episode_overrides(episode_id) values ($1) on conflict do nothing", [episode]);
  for (const [couple, marks] of Object.entries(scores)) {
    const dance = (await db.query<{ id: string }>(
      "insert into public.draft_dance_scores(episode_id, couple_id, dance_style_id) values ($1, $2, $3) returning id", [episode, couple, waltz])).rows[0].id;
    for (const [i, score] of marks.entries())
      await db.query("insert into public.draft_judge_scores(draft_dance_score_id, judge_id, score) values ($1, $2, $3)", [dance, judges[i], score]);
    await db.query("insert into public.draft_episode_results(episode_id, couple_id, outcome) values ($1, $2, 'safe')", [episode, couple]);
  }
}
async function snapshot(episode: string): Promise<PublicationSnapshot> {
  return (await db.query<{ s: PublicationSnapshot }>("select public.episode_publication_snapshot($1) as s", [episode])).rows[0].s;
}
async function danceCardSnapshot(): Promise<DanceCardSnapshot> {
  return (await db.query<{ s: DanceCardSnapshot }>("select public.dance_card_snapshot() as s")).rows[0].s;
}
async function commit(episode: string, plan: unknown, fn = "commit_episode_publication_with_later_weeks") {
  const data = await snapshot(episode);
  await db.query(`select public.${fn}($1, $2, $3, $4)`, [episode, admin, JSON.stringify(data), JSON.stringify(plan)]);
}
async function publish(episode: string, scores: Record<string, number[]>) {
  await draft(episode, scores);
  await commit(episode, buildPublicationPlan(await snapshot(episode), episode));
}
async function stored() {
  return (await db.query<{ league_id: string; manager_id: string; week_id: string; roster_points: number; prediction_points: number; grand_finale_points: number; total_points: number }>(
    `select league_id, manager_id, week_id, roster_points::float as roster_points, prediction_points::float as prediction_points,
       grand_finale_points::float as grand_finale_points, total_points::float as total_points
     from public.weekly_manager_scores order by league_id, week_id, manager_id`)).rows;
}
const one = async (league: string, manager: string, week: string) =>
  (await stored()).find((r) => r.league_id === league && r.manager_id === manager && r.week_id === week)!;
async function setPoints(league: string, rows: unknown, version: string | null, opts: { revision?: string; migrationId?: string | null; actor?: string } = {}) {
  const revision = opts.revision ?? (await danceCardSnapshot())._revision;
  return db.query("select public.set_dance_card_points($1, $2, $3, $4, $5, $6)", [
    opts.actor ?? admin, league, revision, version, opts.migrationId === undefined ? migration : opts.migrationId, JSON.stringify(rows),
  ]);
}
// Weeks 2–3 published on v1 with a Curtain Call hit the switch must keep.
async function twoWeeksOnV1() {
  await publish(e2, { [harry]: [6, 6, 6], [giada]: [4, 4, 4] });
  await publish(e3, { [harry]: [8, 8, 8] });
  await db.exec(`update public.weekly_manager_scores set prediction_points = 5, total_points = total_points + 5 where league_id = '${curve}' and week_id = '${w3}'`);
}
async function switchCurve() {
  await setPoints(curve, danceCardRowsFromLive(await danceCardSnapshot(), curve, "v2"), "v2");
}

describe("apply-dance-card-v2.sql", () => {
  it("commits an old version-3 plan exactly as today while every league is v1", async () => {
    await draft(e2, { [harry]: [6, 6, 6] });
    const plan = buildPublicationPlan(await snapshot(e2), e2) as Partial<PublicationPlan>;
    delete plan.laterDanceCard;
    await commit(e2, { ...plan, planVersion: 3 }, "commit_episode_publication");
    expect(await one(flat, admin, w2)).toMatchObject({ roster_points: 5.97, total_points: 5.97 }); // 18 × 0.2449 + 1.56
  });

  it("switches a league to v2, keeping its picks and archiving what it replaced", async () => {
    await twoWeeksOnV1();
    const before = await stored();
    await switchCurve();
    expect(await one(curve, admin, w2)).toMatchObject({ roster_points: credit(0, 18), total_points: credit(0, 18) * 2 });
    expect(await one(curve, admin, w3)).toMatchObject({ roster_points: credit(18, 42), prediction_points: 5, total_points: Math.round((credit(18, 42) * 2 + 5) * 100) / 100 });
    expect(await one(curve, friend, w2)).toMatchObject({ roster_points: credit(0, 12) });
    expect((await stored()).filter((r) => r.league_id === flat)).toEqual(before.filter((r) => r.league_id === flat));
    const archived = (await db.query<{ n: number }>("select count(*)::int as n from public.weekly_manager_scores_archive where migration_id = $1 and dance_card_version = 'v1'", [migration])).rows[0].n;
    expect(archived).toBe(before.filter((r) => r.league_id === curve).length);
    expect((await db.query<{ v: string }>("select dance_card_version as v from public.scoring_settings where league_id = $1", [curve])).rows[0].v).toBe("v2");
  });

  it("refuses a stale revision, partial or foreign rows, a reused migration, a non-admin, and a v1 rebuild in place", async () => {
    await twoWeeksOnV1();
    const rows = danceCardRowsFromLive(await danceCardSnapshot(), curve, "v2");
    await expect(setPoints(curve, rows, "v2", { revision: "stale" })).rejects.toThrow(/Scores changed/);
    await expect(setPoints(curve, rows.slice(1), "v2")).rejects.toThrow(/cover each/);
    await expect(setPoints(curve, [...rows, ...danceCardRowsFromLive(await danceCardSnapshot(), flat, "v2")], "v2")).rejects.toThrow(/cover each/);
    await expect(setPoints(curve, rows, "v2", { actor: friend })).rejects.toThrow(/Not authorized/);
    await expect(setPoints(curve, rows, null)).rejects.toThrow(/already on v2/);
    await setPoints(curve, rows, "v2");
    await expect(setPoints(flat, danceCardRowsFromLive(await danceCardSnapshot(), flat, "v2"), "v2")).rejects.toThrow(/already used/);
  });

  it("refuses to switch while an episode's scores are posting", async () => {
    await twoWeeksOnV1();
    await db.query("insert into public.dance_scores(episode_id, couple_id, dance_style_id, total_score, scaled_score) values ($1, $2, $3, 24, 24)", [e4, harry, waltz]);
    await expect(setPoints(curve, danceCardRowsFromLive(await danceCardSnapshot(), curve, "v2"), "v2")).rejects.toThrow(/Scores are posting/);
  });

  it("publishes the next week on v2 exactly as a rebuild from live data would", async () => {
    await twoWeeksOnV1();
    await switchCurve();
    await publish(e4, { [harry]: [9, 9, 9] });
    expect(await one(curve, admin, w4)).toMatchObject({ roster_points: credit(42, 69) });
    const live = await danceCardSnapshot();
    expect(danceCardDifferences(live.weeklyScores, danceCardRowsFromLive(live, curve, "v2"))).toEqual([]);
  });

  it("rewrites a v2 league's later weeks in the same commit when an earlier week is corrected", async () => {
    await twoWeeksOnV1();
    await switchCurve();
    await publish(e4, { [harry]: [9, 9, 9] });
    await db.exec(`update public.weekly_manager_scores set prediction_points = 3, total_points = total_points + 3 where league_id = '${curve}' and week_id = '${w4}'`);
    const flatWeek4 = await one(flat, admin, w4);
    await draft(e3, { [harry]: [10, 10, 10] });
    await commit(e3, buildPublicationPlan(await snapshot(e3), e3));
    expect(await one(curve, admin, w3)).toMatchObject({ roster_points: credit(18, 48) });
    expect(await one(curve, admin, w4)).toMatchObject({
      roster_points: credit(48, 75),
      prediction_points: 3,
      total_points: Math.round((credit(48, 75) * 2 + 3) * 100) / 100,
    });
    expect(await one(flat, admin, w4)).toEqual(flatWeek4);
    const live = await danceCardSnapshot();
    expect(danceCardDifferences(live.weeklyScores, danceCardRowsFromLive(live, curve, "v2"))).toEqual([]);
  });

  it("rolls the whole correction back when the later weeks don't add up", async () => {
    await twoWeeksOnV1();
    await switchCurve();
    await publish(e4, { [harry]: [9, 9, 9] });
    const before = await stored();
    await draft(e3, { [harry]: [10, 10, 10] });
    const plan = buildPublicationPlan(await snapshot(e3), e3);
    await expect(commit(e3, { ...plan, laterDanceCard: plan.laterDanceCard.slice(1) })).rejects.toThrow(/out of date/);
    await expect(commit(e3, { ...plan, laterDanceCard: plan.laterDanceCard.map((r) => ({ ...r, total_points: r.total_points + 1 })) })).rejects.toThrow(/out of date/);
    expect(await stored()).toEqual(before);
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.draft_dance_scores where episode_id = $1", [e3])).rows[0].n).toBe(1);
    expect((await db.query<{ t: number }>("select total_score::float as t from public.dance_scores where episode_id = $1", [e3])).rows[0].t).toBe(24);
  });

  it("refuses an old plan, and a reveal out of order, once a league is on v2", async () => {
    await twoWeeksOnV1();
    await switchCurve();
    await draft(e4, { [harry]: [9, 9, 9] });
    const plan = buildPublicationPlan(await snapshot(e4), e4);
    await expect(commit(e4, { ...plan, planVersion: 3 }, "commit_episode_publication")).rejects.toThrow(/week by week/);
    await expect(db.query("select public.assert_special_dance_plan($1, $2)", [e2, JSON.stringify({ planVersion: 4 })])).rejects.toThrow(
      "Week 3 already has scores. Publish weeks in order."
    );
    await db.query("select public.assert_special_dance_plan($1, $2)", [e2, JSON.stringify({ planVersion: 4, laterDanceCard: [] })]);
  });

  it("holds a v2 league's Anchor Week once it has scores, and rolls back to v1 exactly", async () => {
    await twoWeeksOnV1();
    const v1 = (await stored()).filter((r) => r.league_id === curve);
    await switchCurve();
    await expect(db.query("update public.scoring_settings set judges_score_starts_week = 3 where league_id = $1", [curve])).rejects.toThrow(/Anchor Week/);
    await db.query("update public.scoring_settings set judges_score_starts_week = 3 where league_id = $1", [flat]);
    await setPoints(curve, danceCardRowsFromLive(await danceCardSnapshot(), curve, "v1"), "v1", { migrationId: id(91) });
    expect((await stored()).filter((r) => r.league_id === curve)).toEqual(v1);
  });
});
