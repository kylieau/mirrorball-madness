import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1), friend = id(2);
const season = id(4), week = id(5), episode = id(6), style = id(7);
const judges = [id(20), id(21), id(22)];
const amber = id(32), julia = id(33);
let db: PGlite;

const schemaSql = readFileSync("supabase/schema.sql", "utf8")
  .replace('create extension if not exists "pgcrypto";', "")
  .replace(/alter publication supabase_realtime add table [^;]+;/g, "");

async function freshDb() {
  const instance = new PGlite();
  await instance.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;`);
  await instance.exec(schemaSql);
  for (const file of ["apply-team-dance-entity", "apply-special-dances", "apply-special-dances-polish", "apply-whole-judge-marks", "apply-whole-judge-marks"]) {
    await instance.exec(readFileSync(`supabase/${file}.sql`, "utf8"));
  }
  return instance;
}

async function seedSeason() {
  await db.exec(`reset role; truncate public.seasons, public.leagues, auth.users, public.people, public.dance_styles cascade;
    insert into public.dance_styles(id, name, category) values ('${style}', 'Freestyle', 'show');
    insert into auth.users(id, email) values ('${admin}', 'admin@example.test'), ('${friend}', 'friend@example.test');
    update public.profiles set is_super_admin = true where id = '${admin}';
    update public.profiles set can_propose_results = true where id = '${friend}';
    insert into public.seasons(id, name, is_active) values ('${season}', 'S35', true);
    insert into public.competition_weeks(id, season_id, week_number) values ('${week}', '${season}', 9);
    insert into public.episodes(id, season_id, week_id, episode_number, airs_at, expected_dance_count) values ('${episode}', '${season}', '${week}', 10, now() - interval '1 hour', 1);
    insert into public.people(id, name, role) values
      ('${judges[0]}', 'Carrie Ann Inaba', 'judge'), ('${judges[1]}', 'Derek Hough', 'judge'), ('${judges[2]}', 'Bruno Tonioli', 'judge');
    insert into public.people(id, name, role) select ('00000000-0000-4000-8000-' || lpad((40 + n)::text, 12, '0'))::uuid, 'Celebrity ' || n, 'celebrity' from generate_series(0, 1) n;
    insert into public.people(id, name, role) select ('00000000-0000-4000-8000-' || lpad((50 + n)::text, 12, '0'))::uuid, 'Pro ' || n, 'pro' from generate_series(0, 1) n;
    insert into public.couples(id, season_id, celebrity_id, pro_id)
      select ('00000000-0000-4000-8000-' || lpad((32 + n)::text, 12, '0'))::uuid, '${season}',
             ('00000000-0000-4000-8000-' || lpad((40 + n)::text, 12, '0'))::uuid, ('00000000-0000-4000-8000-' || lpad((50 + n)::text, 12, '0'))::uuid
      from generate_series(0, 1) n;`);
}

async function saveSpecial(dance: Record<string, unknown>): Promise<string> {
  return (await db.query<{ id: string }>("select public.save_special_dance($1, $2, $3) as id", [episode, admin, JSON.stringify(dance)])).rows[0].id;
}

async function liveDance(): Promise<string> {
  return (await db.query<{ id: string }>(
    "insert into public.dance_scores(episode_id, couple_id, dance_style_id, total_score) values ($1, $2, $3, 0) returning id",
    [episode, amber, style]
  )).rows[0].id;
}

async function draftDance(): Promise<string> {
  return (await db.query<{ id: string }>(
    "insert into public.draft_dance_scores(episode_id, couple_id, dance_style_id) values ($1, $2, $3) returning id",
    [episode, amber, style]
  )).rows[0].id;
}

describe("whole judge marks SQL", () => {
  beforeAll(async () => {
    db = await freshDb();
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  beforeEach(seedSeason);

  it("refuses 0, half and over-10 marks on every marks table and takes a whole mark", async () => {
    const live = await liveDance();
    const draft = await draftDance();
    const team = await saveSpecial({ danceType: "Challenge", name: "Cha-Cha Challenge", memberCoupleIds: [amber, julia] });
    const tables = [
      { sql: "insert into public.judge_scores(dance_score_id, judge_id, score) values ($1, $2, $3)", owner: live },
      { sql: "insert into public.draft_judge_scores(draft_dance_score_id, judge_id, score) values ($1, $2, $3)", owner: draft },
      { sql: "insert into public.episode_team_marks(team_id, judge_id, score) values ($1, $2, $3)", owner: team },
    ];
    for (const { sql, owner } of tables) {
      for (const score of [0, 8.5, 11]) await expect(db.query(sql, [owner, judges[0], score])).rejects.toThrow(/whole_mark/);
      await db.query(sql, [owner, judges[0], 7]);
    }
  });

  it("refuses a half mark through save_team_marks with the app's message", async () => {
    const team = await saveSpecial({ danceType: "Challenge", name: "Cha-Cha Challenge", memberCoupleIds: [amber, julia] });
    for (const score of [0, 8.5, 11]) {
      await expect(
        db.query("select public.save_team_marks($1, $2, $3, $4)", [episode, team, friend, JSON.stringify([{ judgeId: judges[0], score }])])
      ).rejects.toThrow("Judge scores must be whole numbers from 1 to 10.");
    }
    await db.query("select public.save_team_marks($1, $2, $3, $4)", [episode, team, friend, JSON.stringify(judges.map((judgeId) => ({ judgeId, score: 8 })))]);
    expect((await db.query<{ n: number }>("select sum(score)::int as n from public.episode_team_marks where team_id = $1", [team])).rows[0].n).toBe(24);
  });

  it("keeps every special dance out of 10 on the night's judges", async () => {
    await expect(saveSpecial({ danceType: "Relay", name: "Relay", memberCoupleIds: [amber], markMax: 8 })).rejects.toThrow(/night_panel/);
    await expect(saveSpecial({ danceType: "Relay", name: "Relay", memberCoupleIds: [amber], panelJudgeIds: judges.slice(0, 2) })).rejects.toThrow(/night_panel/);
    const team = await saveSpecial({ danceType: "Relay", name: "Relay", memberCoupleIds: [amber] });
    expect((await db.query("select mark_max::int, panel_judge_ids from public.episode_teams where id = $1", [team])).rows[0]).toEqual({ mark_max: 10, panel_judge_ids: null });
  });
});
