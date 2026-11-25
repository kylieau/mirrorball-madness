import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildPublicationPlan, type PublicationSnapshot } from "./episode-publication";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1), friend = id(2);
const season = id(4), week = id(5), episode = id(6), league = id(7), rumba = id(8);
const judges = [id(20), id(21), id(22)];
const cast = [id(30), id(31), id(32), id(33), id(34)];
const [winner, second, third, fourth, fifth] = cast;
let db: PGlite;

// The files applied live, in order (see per-dance-publish-db.test.ts), then this one.
const LIVE_STACK = [
  "apply-audit-security", "apply-audit-deadlines", "apply-audit-settings", "apply-audit-prediction-provenance",
  "apply-curtain-call-backfill", "apply-curtain-call-backfill-lock-check", "apply-service-role-season-grants",
  "apply-drop-curtain-call-lock-guard", "apply-team-dance-entity", "apply-special-dances", "apply-special-dances-polish",
  "apply-draft-release-own-rows", "apply-whole-judge-marks", "apply-special-draft-release",
  "apply-contributor-special-setup", "apply-draft-lineup", "apply-retire-special-leftovers", "apply-episode-rounds",
  "apply-special-dance-label", "apply-dance-card-v2", "apply-dance-card-v3", "apply-immune-heat-guard",
  "apply-draft-dance-slots", "apply-episode-rounds-reorder", "apply-per-dance-publish",
];
const placesSql = readFileSync("supabase/apply-finale-places.sql", "utf8");

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
  await db.exec(placesSql);
  await db.exec(placesSql);
}, 120000);
afterAll(async () => db?.close());

async function seed(isFinale: boolean) {
  await db.exec(`truncate public.seasons, public.leagues, auth.users, public.people, public.dance_styles cascade;
    insert into public.dance_styles(id, name, category) values ('${rumba}', 'Rumba', 'latin');
    insert into auth.users(id, email) values ('${admin}', 'admin@example.test'), ('${friend}', 'friend@example.test');
    update public.profiles set is_super_admin = true where id = '${admin}';
    update public.profiles set can_propose_results = true where id = '${friend}';
    insert into public.seasons(id, name, is_active) values ('${season}', 'S35', true);
    insert into public.competition_weeks(id, season_id, week_number, is_finale) values ('${week}', '${season}', 11, ${isFinale});
    insert into public.episodes(id, season_id, week_id, episode_number, airs_at, expected_dance_count) values ('${episode}', '${season}', '${week}', 12, now() - interval '1 hour', 1);
    insert into public.people(id, name, role) values
      ('${judges[0]}', 'Carrie Ann Inaba', 'judge'), ('${judges[1]}', 'Derek Hough', 'judge'), ('${judges[2]}', 'Bruno Tonioli', 'judge');
    insert into public.people(id, name, role) select ('00000000-0000-4000-8000-' || lpad((40 + n)::text, 12, '0'))::uuid, 'Celebrity ' || n, 'celebrity' from generate_series(0, 4) n;
    insert into public.people(id, name, role) select ('00000000-0000-4000-8000-' || lpad((50 + n)::text, 12, '0'))::uuid, 'Pro ' || n, 'pro' from generate_series(0, 4) n;
    insert into public.couples(id, season_id, celebrity_id, pro_id)
      select ('00000000-0000-4000-8000-' || lpad((30 + n)::text, 12, '0'))::uuid, '${season}',
             ('00000000-0000-4000-8000-' || lpad((40 + n)::text, 12, '0'))::uuid, ('00000000-0000-4000-8000-' || lpad((50 + n)::text, 12, '0'))::uuid
      from generate_series(0, 4) n;
    insert into public.leagues(id, name, invite_code, commissioner_id) values ('${league}', 'Test', 'TEST', '${admin}');
    insert into public.league_members(league_id, user_id, role) values ('${league}', '${admin}', 'commissioner');
    insert into public.scoring_settings(league_id, judges_score_multiplier, survival_points) values ('${league}', 1, 0);`);
}

async function saveFinale(places: Record<string, [string, number | null]>) {
  const entries = cast.map((coupleId) => ({
    coupleId, outcome: places[coupleId][0], finalPlace: places[coupleId][1],
    savedByJudges: false, hadImmunity: false, bonusPoints: 0, bonusNote: null,
    dances: [{ slot: 1, danceStyleId: rumba, songTitle: "Song", judgeScores: judges.map((judgeId) => ({ judgeId, score: 9 })) }],
  }));
  await db.query("select public.save_episode_draft_checked($1)", [
    JSON.stringify({ episodeId: episode, updatedBy: friend, guestJudgeName: null, judgesSaveAvailable: false, inJeopardyCoupleIds: [], entries, correctionToken: null }),
  ]);
}
async function finishWeek() {
  const data = (await db.query<{ data: PublicationSnapshot }>("select public.episode_publication_snapshot($1) as data", [episode])).rows[0].data;
  await db.query("select public.commit_episode_publication_with_later_weeks($1, $2, $3, $4)", [episode, admin, JSON.stringify(data), JSON.stringify(buildPublicationPlan(data, episode))]);
}
const places = async (table: "draft_episode_results" | "episode_results") =>
  (await db.query<{ couple_id: string; final_place: number | null }>(`select couple_id, final_place from public.${table} where episode_id = $1 order by couple_id`, [episode])).rows.map((r) => r.final_place);
const couplePlaces = async () =>
  (await db.query<{ status: string; final_place: number | null }>("select status, final_place from public.couples order by id")).rows.map((r) => `${r.status}:${r.final_place ?? "-"}`);

const finaleOutcomes = {
  [winner]: ["winner", null], [second]: ["runner_up", null], [third]: ["third_place", null],
  [fourth]: ["eliminated", 4], [fifth]: ["eliminated", 5],
} as Record<string, [string, number | null]>;

describe("the Finale's 4th and 5th places", () => {
  beforeEach(() => seed(true));

  it("saves, publishes onto the results and the couples, and seeds a correction with them", async () => {
    await saveFinale(finaleOutcomes);
    expect(await places("draft_episode_results")).toEqual([null, null, null, 4, 5]);
    await finishWeek();
    expect(await places("episode_results")).toEqual([null, null, null, 4, 5]);
    expect(await couplePlaces()).toEqual(["winner:-", "runner_up:-", "third_place:-", "eliminated:4", "eliminated:5"]);

    await db.query("select public.seed_episode_correction($1, $2)", [episode, admin]);
    expect(await places("draft_episode_results")).toEqual([null, null, null, 4, 5]);
  });

  it("drops a place on anyone not Eliminated", async () => {
    await saveFinale({ ...finaleOutcomes, [third]: ["third_place", 4] });
    expect(await places("draft_episode_results")).toEqual([null, null, null, 4, 5]);
  });
});

describe("a week that isn't the Finale", () => {
  beforeEach(() => seed(false));

  it("keeps no place", async () => {
    await saveFinale(finaleOutcomes);
    expect(await places("draft_episode_results")).toEqual([null, null, null, null, null]);
  });
});
