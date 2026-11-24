import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildPublicationPlan, type PublicationSnapshot } from "./episode-publication";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1), friend = id(2);
const season = id(4), week = id(5), episode = id(6), league = id(7), freestyle = id(8), rumba = id(9);
const judges = [id(20), id(21), id(22)];
const amber = id(30), maura = id(31);
let db: PGlite;

// The files applied live, in order (see episode-rounds-db.test.ts), then this one.
const LIVE_STACK = [
  "apply-audit-security", "apply-audit-deadlines", "apply-audit-settings", "apply-audit-prediction-provenance",
  "apply-curtain-call-backfill", "apply-curtain-call-backfill-lock-check", "apply-service-role-season-grants",
  "apply-drop-curtain-call-lock-guard", "apply-team-dance-entity", "apply-special-dances", "apply-special-dances-polish",
  "apply-draft-release-own-rows", "apply-whole-judge-marks", "apply-special-draft-release",
  "apply-contributor-special-setup", "apply-draft-lineup", "apply-retire-special-leftovers",
  "apply-episode-rounds", "apply-immune-heat-guard",
];

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
  await db.exec(`reset role; truncate public.seasons, public.leagues, auth.users, public.people, public.dance_styles cascade;
    insert into public.dance_styles(id, name, category) values ('${freestyle}', 'Freestyle', 'show'), ('${rumba}', 'Rumba', 'latin');
    insert into auth.users(id, email) values ('${admin}', 'admin@example.test'), ('${friend}', 'friend@example.test');
    update public.profiles set is_super_admin = true where id = '${admin}';
    update public.profiles set can_propose_results = true where id = '${friend}';
    insert into public.seasons(id, name, is_active) values ('${season}', 'S35', true);
    insert into public.competition_weeks(id, season_id, week_number) values ('${week}', '${season}', 11);
    insert into public.episodes(id, season_id, week_id, episode_number, airs_at, expected_dance_count) values ('${episode}', '${season}', '${week}', 12, now() - interval '1 hour', 3);
    insert into public.people(id, name, role) values
      ('${judges[0]}', 'Carrie Ann Inaba', 'judge'), ('${judges[1]}', 'Derek Hough', 'judge'), ('${judges[2]}', 'Bruno Tonioli', 'judge');
    insert into public.people(id, name, role) select ('00000000-0000-4000-8000-' || lpad((40 + n)::text, 12, '0'))::uuid, 'Celebrity ' || n, 'celebrity' from generate_series(0, 1) n;
    insert into public.people(id, name, role) select ('00000000-0000-4000-8000-' || lpad((50 + n)::text, 12, '0'))::uuid, 'Pro ' || n, 'pro' from generate_series(0, 1) n;
    insert into public.couples(id, season_id, celebrity_id, pro_id)
      select ('00000000-0000-4000-8000-' || lpad((30 + n)::text, 12, '0'))::uuid, '${season}',
             ('00000000-0000-4000-8000-' || lpad((40 + n)::text, 12, '0'))::uuid, ('00000000-0000-4000-8000-' || lpad((50 + n)::text, 12, '0'))::uuid
      from generate_series(0, 1) n;
    insert into public.leagues(id, name, invite_code, commissioner_id) values ('${league}', 'Test', 'TEST', '${admin}');
    insert into public.league_members(league_id, user_id, role) values ('${league}', '${admin}', 'commissioner'), ('${league}', '${friend}', 'manager');
    insert into public.scoring_settings(league_id, judges_score_multiplier, survival_points) values ('${league}', 1, 0);
    insert into public.roster_slots(league_id, manager_id, slot_number, couple_id, source, start_week) values
      ('${league}', '${admin}', 1, '${amber}', 'draft', 1), ('${league}', '${friend}', 1, '${maura}', 'draft', 1);`);
}

type Dance = { slot?: number; style: string; song: string; marks?: number[] };

async function save(couple: string, dances: Dance[]) {
  const entry = {
    coupleId: couple, outcome: "safe", savedByJudges: false, hadImmunity: false, bonusPoints: 0, bonusNote: null,
    dances: dances.map((d) => ({
      ...(d.slot == null ? {} : { slot: d.slot }),
      danceStyleId: d.style,
      songTitle: d.song,
      judgeScores: (d.marks ?? []).map((score, j) => ({ judgeId: judges[j], score })),
    })),
  };
  return (await db.query<{ data: { acknowledged: string[]; skippedPosted: string[] } }>("select public.save_episode_draft_checked($1) as data", [
    JSON.stringify({ episodeId: episode, updatedBy: friend, guestJudgeName: null, judgesSaveAvailable: false, inJeopardyCoupleIds: [], entries: [entry], correctionToken: null }),
  ])).rows[0].data;
}

async function slots(couple: string) {
  return (await db.query<{ slot: number | null; song: string }>(
    "select dance_slot as slot, song_title as song from public.draft_dance_scores where episode_id = $1 and couple_id = $2 order by song_title",
    [episode, couple]
  )).rows;
}

describe("draft dance slots SQL", () => {
  beforeAll(async () => {
    db = await freshDb();
    // Rerunning the file must be safe.
    await db.exec(readFileSync("supabase/apply-draft-dance-slots.sql", "utf8"));
    await db.exec(readFileSync("supabase/apply-draft-dance-slots.sql", "utf8"));
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  beforeEach(seed);

  it("stores the round a dance was entered in, so a Freestyle saved alone keeps slot 3", async () => {
    await save(amber, [{ slot: 3, style: freestyle, song: "Like a Prayer" }]);
    expect(await slots(amber)).toEqual([{ slot: 3, song: "Like a Prayer" }]);
    await save(amber, [{ slot: 1, style: rumba, song: "A" }, { slot: 3, style: freestyle, song: "Like a Prayer" }]);
    expect(await slots(amber)).toEqual([{ slot: 1, song: "A" }, { slot: 3, song: "Like a Prayer" }]);
  });

  it("still takes a save from the app before slots, writing none", async () => {
    await save(amber, [{ style: freestyle, song: "Like a Prayer" }]);
    expect(await slots(amber)).toEqual([{ slot: null, song: "Like a Prayer" }]);
  });

  it("refuses a slot outside 1 to 12", async () => {
    await expect(save(amber, [{ slot: 13, style: freestyle, song: "X" }])).rejects.toThrow(/dance_slot/);
  });

  it("matches a posted couple's draft whatever slot the page sends", async () => {
    await save(amber, [{ slot: 3, style: freestyle, song: "Like a Prayer", marks: [9, 9, 9] }]);
    await db.exec(`insert into public.dance_scores(id, episode_id, couple_id, dance_style_id, song_title, total_score, scaled_score)
      values ('${id(60)}', '${episode}', '${amber}', '${freestyle}', 'Like a Prayer', 27, 27);
      insert into public.judge_scores(dance_score_id, judge_id, score) values ('${id(60)}', '${judges[0]}', 9), ('${id(60)}', '${judges[1]}', 9), ('${id(60)}', '${judges[2]}', 9);`);
    expect(await save(amber, [{ slot: 1, style: freestyle, song: "Like a Prayer", marks: [9, 9, 9] }])).toEqual({ acknowledged: [amber], skippedPosted: [] });
    expect(await save(amber, [{ slot: 3, style: freestyle, song: "Like a Prayer", marks: [9, 8, 9] }])).toEqual({ acknowledged: [], skippedPosted: [amber] });
    expect(await slots(amber)).toEqual([{ slot: 3, song: "Like a Prayer" }]);
  });

  it("publishes a night whose drafts carry slots", async () => {
    await save(amber, [{ slot: 1, style: rumba, song: "A", marks: [8, 8, 8] }, { slot: 3, style: freestyle, song: "B", marks: [9, 9, 9] }]);
    await save(maura, [{ slot: 2, style: rumba, song: "C", marks: [7, 7, 7] }]);
    const data = (await db.query<{ data: PublicationSnapshot }>("select public.episode_publication_snapshot($1) as data", [episode])).rows[0].data;
    await db.query("select public.commit_episode_publication($1, $2, $3, $4)", [episode, admin, JSON.stringify(data), JSON.stringify(buildPublicationPlan(data, episode))]);
    const live = (await db.query<{ couple_id: string; total: number }>(
      "select couple_id, total_score::float as total from public.dance_scores where episode_id = $1 order by couple_id, total_score", [episode])).rows;
    expect(live).toEqual([{ couple_id: amber, total: 24 }, { couple_id: amber, total: 27 }, { couple_id: maura, total: 21 }]);
    expect(await slots(amber)).toEqual([]);
  });
});
