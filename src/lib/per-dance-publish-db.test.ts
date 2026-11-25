import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildPublicationPlan, type PublicationSnapshot } from "./episode-publication";
import { buildDanceRevealPlan, buildRevealPlan } from "./episode-reveal";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1), friend = id(2);
const season = id(4), week = id(5), episode = id(6), league = id(7), rumba = id(8), freestyle = id(9);
const judges = [id(20), id(21), id(22)];
const amber = id(30), ezra = id(31);
let db: PGlite;

// The files applied live, in order (see dance-card-v3-night-db.test.ts), then this one.
const LIVE_STACK = [
  "apply-audit-security", "apply-audit-deadlines", "apply-audit-settings", "apply-audit-prediction-provenance",
  "apply-curtain-call-backfill", "apply-curtain-call-backfill-lock-check", "apply-service-role-season-grants",
  "apply-drop-curtain-call-lock-guard", "apply-team-dance-entity", "apply-special-dances", "apply-special-dances-polish",
  "apply-draft-release-own-rows", "apply-whole-judge-marks", "apply-special-draft-release",
  "apply-contributor-special-setup", "apply-draft-lineup", "apply-retire-special-leftovers", "apply-episode-rounds",
  "apply-special-dance-label", "apply-dance-card-v2", "apply-dance-card-v3", "apply-immune-heat-guard",
  "apply-draft-dance-slots", "apply-episode-rounds-reorder",
];
const perDanceSql = readFileSync("supabase/apply-per-dance-publish.sql", "utf8");

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
  await db.exec(perDanceSql);
  await db.exec(perDanceSql);
}, 120000);
afterAll(async () => db?.close());

beforeEach(async () => {
  await db.exec(`truncate public.seasons, public.leagues, auth.users, public.people, public.dance_styles cascade;
    insert into public.dance_styles(id, name, category) values ('${rumba}', 'Rumba', 'latin'), ('${freestyle}', 'Freestyle', 'show');
    insert into auth.users(id, email) values ('${admin}', 'admin@example.test'), ('${friend}', 'friend@example.test');
    update public.profiles set is_super_admin = true where id = '${admin}';
    update public.profiles set can_propose_results = true where id = '${friend}';
    insert into public.seasons(id, name, is_active) values ('${season}', 'S35', true);
    insert into public.competition_weeks(id, season_id, week_number) values ('${week}', '${season}', 11);
    insert into public.episodes(id, season_id, week_id, episode_number, airs_at, expected_dance_count) values ('${episode}', '${season}', '${week}', 12, now() - interval '1 hour', 3);
    insert into public.people(id, name, role) values
      ('${judges[0]}', 'Carrie Ann Inaba', 'judge'), ('${judges[1]}', 'Derek Hough', 'judge'), ('${judges[2]}', 'Bruno Tonioli', 'judge'),
      ('${id(40)}', 'Amber Glenn', 'celebrity'), ('${id(41)}', 'Ezra Frech', 'celebrity'), ('${id(50)}', 'Pro A', 'pro'), ('${id(51)}', 'Pro B', 'pro');
    insert into public.couples(id, season_id, celebrity_id, pro_id) values ('${amber}', '${season}', '${id(40)}', '${id(50)}'), ('${ezra}', '${season}', '${id(41)}', '${id(51)}');
    insert into public.leagues(id, name, invite_code, commissioner_id) values ('${league}', 'Test', 'TEST', '${admin}');
    insert into public.league_members(league_id, user_id, role) values ('${league}', '${admin}', 'commissioner'), ('${league}', '${friend}', 'manager');
    insert into public.scoring_settings(league_id, judges_score_multiplier, survival_points) values ('${league}', 0.2449, 0);
    insert into public.roster_slots(league_id, manager_id, slot_number, couple_id, source, start_week) values
      ('${league}', '${admin}', 1, '${amber}', 'draft', 1), ('${league}', '${friend}', 1, '${ezra}', 'draft', 1);`);
  await db.query("select public.save_episode_rounds($1, $2, $3)", [episode, admin, JSON.stringify([
    { kind: "own", roundType: "Judges Choice" }, { kind: "own", roundType: "Instant Dance" }, { kind: "own", roundType: "Freestyle" },
  ])]);
});

type Dance = { slot: number; style?: string; song: string; marks?: number[] };

async function save(couple: string, dances: Dance[]) {
  const entry = {
    coupleId: couple, outcome: "safe", savedByJudges: false, hadImmunity: false, bonusPoints: 0, bonusNote: null,
    dances: dances.map((d) => ({
      slot: d.slot, danceStyleId: d.style ?? rumba, songTitle: d.song,
      judgeScores: (d.marks ?? []).map((score, j) => ({ judgeId: judges[j], score })),
    })),
  };
  return (await db.query<{ data: { acknowledged: string[]; skippedPosted: string[] } }>("select public.save_episode_draft_checked($1) as data", [
    JSON.stringify({ episodeId: episode, updatedBy: friend, guestJudgeName: null, judgesSaveAvailable: false, inJeopardyCoupleIds: [], entries: [entry], correctionToken: null }),
  ])).rows[0].data;
}
async function snapshot(): Promise<PublicationSnapshot> {
  return (await db.query<{ data: PublicationSnapshot }>("select public.episode_publication_snapshot($1) as data", [episode])).rows[0].data;
}
async function postDance(couple: string, slot: number, undo = false) {
  const data = await snapshot();
  await db.query("select public.commit_dance_reveal($1, $2, $3, $4, $5, $6, $7)",
    [episode, couple, slot, admin, JSON.stringify(data), JSON.stringify(buildDanceRevealPlan(data, episode, couple, slot, undo)), undo]);
}
async function postCouple(couple: string) {
  const data = await snapshot();
  await db.query("select public.commit_episode_reveal($1, $2, $3, $4, $5, false)",
    [episode, couple, admin, JSON.stringify(data), JSON.stringify(buildRevealPlan(data, episode, couple, false))]);
}
async function finishWeek() {
  const data = await snapshot();
  await db.query("select public.commit_episode_publication_with_later_weeks($1, $2, $3, $4)", [episode, admin, JSON.stringify(data), JSON.stringify(buildPublicationPlan(data, episode))]);
}
const live = async (couple: string) =>
  (await db.query<{ song: string; total: number }>("select song_title as song, total_score::float as total from public.dance_scores where episode_id = $1 and couple_id = $2 order by song_title", [episode, couple])).rows;
const drafts = async (couple: string) =>
  (await db.query<{ slot: number; song: string; posted: boolean }>(
    "select dance_slot as slot, song_title as song, live_dance_score_id is not null as posted from public.draft_dance_scores where episode_id = $1 and couple_id = $2 order by dance_slot", [episode, couple])).rows;
const roster = async (managerId: string) =>
  (await db.query<{ p: number }>("select roster_points::float as p from public.weekly_manager_scores where manager_id = $1 and week_id = $2", [managerId, week])).rows[0]?.p ?? 0;

describe("publishing one dance at a time", () => {
  it("posts a round while a later round is still prefilled, then posts and un-posts each dance on its own", async () => {
    await save(amber, [{ slot: 1, song: "Quickstep", marks: [8, 8, 8] }, { slot: 3, style: freestyle, song: "Like a Prayer" }]);
    await postDance(amber, 1);
    expect(await live(amber)).toEqual([{ song: "Quickstep", total: 24 }]);
    expect(await roster(admin)).toBe(5.88);

    // The Freestyle airs: its marks save while Round 1 stays posted.
    expect(await save(amber, [{ slot: 1, song: "Quickstep", marks: [8, 8, 8] }, { slot: 3, style: freestyle, song: "Like a Prayer", marks: [9, 9, 9] }]))
      .toEqual({ acknowledged: [amber], skippedPosted: [] });
    await postDance(amber, 3);
    expect(await live(amber)).toEqual([{ song: "Like a Prayer", total: 27 }, { song: "Quickstep", total: 24 }]);
    expect(await roster(admin)).toBe(6.24);

    // Un-posting Round 1 leaves the Freestyle live.
    await postDance(amber, 1, true);
    expect(await live(amber)).toEqual([{ song: "Like a Prayer", total: 27 }]);
    expect(await drafts(amber)).toEqual([{ slot: 1, song: "Quickstep", posted: false }, { slot: 3, song: "Like a Prayer", posted: true }]);
    expect(await roster(admin)).toBe(6.61);
  });

  it("skips a save that changes a posted dance, keeping everything as posted", async () => {
    await save(amber, [{ slot: 1, song: "Quickstep", marks: [8, 8, 8] }]);
    await postDance(amber, 1);
    expect(await save(amber, [{ slot: 1, song: "Quickstep", marks: [8, 9, 8] }, { slot: 2, song: "Instant", marks: [7, 7, 7] }]))
      .toEqual({ acknowledged: [], skippedPosted: [amber] });
    expect(await save(amber, [{ slot: 2, song: "Instant" }])).toEqual({ acknowledged: [], skippedPosted: [amber] });
    expect(await drafts(amber)).toEqual([{ slot: 1, song: "Quickstep", posted: true }]);
  });

  it("refuses a dance without every judge's mark, or one posted twice", async () => {
    await save(amber, [{ slot: 1, song: "Quickstep" }]);
    await expect(postDance(amber, 1)).rejects.toThrow(/judge scores/);
    await expect(postDance(amber, 2)).rejects.toThrow(/No saved dance in that round/);
    await save(amber, [{ slot: 1, song: "Quickstep", marks: [8, 8, 8] }]);
    await postDance(amber, 1);
    await expect(postDance(amber, 1)).rejects.toThrow(/already posted/);
  });

  it("names a dance still to publish before Finish Week, then finishes", async () => {
    await save(amber, [{ slot: 1, song: "Quickstep", marks: [8, 8, 8] }, { slot: 2, song: "Instant", marks: [9, 9, 9] }]);
    await save(ezra, [{ slot: 1, song: "Tango", marks: [7, 7, 7] }]);
    await postDance(amber, 1);
    await postDance(ezra, 1);
    const data = await snapshot();
    await expect(db.query("select public.commit_episode_publication($1, $2, $3, $4)", [episode, admin, JSON.stringify(data), JSON.stringify(buildPublicationPlanSkippingChecks(data))]))
      .rejects.toThrow(/Publish every dance before finishing the week: Amber Glenn's Instant Dance is still to publish/);
    await postDance(amber, 2);
    await finishWeek();
    expect(await live(amber)).toEqual([{ song: "Instant", total: 27 }, { song: "Quickstep", total: 24 }]);
  });

  it("links a whole couple posted the old way, and dances posted before this file", async () => {
    await save(amber, [{ slot: 1, song: "Quickstep", marks: [8, 8, 8] }, { slot: 2, song: "Instant", marks: [9, 9, 9] }]);
    await postCouple(amber);
    expect(await drafts(amber)).toEqual([{ slot: 1, song: "Quickstep", posted: true }, { slot: 2, song: "Instant", posted: true }]);
    await postDance(amber, 2, true);
    expect(await live(amber)).toEqual([{ song: "Quickstep", total: 24 }]);

    await save(ezra, [{ slot: 1, song: "Tango", marks: [7, 7, 7] }]);
    await postCouple(ezra);
    await db.exec(`update public.draft_dance_scores set live_dance_score_id = null, dance_slot = null where couple_id = '${ezra}'`);
    await db.exec(perDanceSql);
    expect(await drafts(ezra)).toEqual([{ slot: 1, song: "Tango", posted: true }]);
    await postDance(ezra, 1, true);
    expect(await live(ezra)).toEqual([]);
  });
});

// The plan's own check that posted couples match their draft would refuse
// first, so build it from a snapshot without the unposted dance: the SQL
// still names that dance.
function buildPublicationPlanSkippingChecks(data: PublicationSnapshot) {
  return buildPublicationPlan({ ...data, draftDances: data.draftDances.filter((d) => d.live_dance_score_id != null) }, episode);
}
