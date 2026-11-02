import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1), friend = id(2);
const season = id(4), week = id(5), episode = id(6);
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
  await instance.exec(readFileSync("supabase/apply-team-dance-entity.sql", "utf8"));
  await instance.exec(readFileSync("supabase/apply-special-dances.sql", "utf8"));
  await instance.exec(readFileSync("supabase/apply-special-dances-polish.sql", "utf8"));
  await instance.exec(readFileSync("supabase/apply-special-dances-polish.sql", "utf8"));
  return instance;
}

async function seedSeason() {
  await db.exec(`reset role; truncate public.seasons, public.leagues, auth.users, public.people, public.dance_styles cascade;
    insert into public.dance_styles(name, category) values ('Freestyle', 'show');
    insert into auth.users(id, email) values ('${admin}', 'admin@example.test'), ('${friend}', 'friend@example.test');
    update public.profiles set is_super_admin = true where id = '${admin}';
    update public.profiles set can_propose_results = true where id = '${friend}';
    insert into public.seasons(id, name, is_active) values ('${season}', 'S35', true);
    insert into public.competition_weeks(id, season_id, week_number) values ('${week}', '${season}', 8);
    insert into public.episodes(id, season_id, week_id, episode_number, airs_at, expected_dance_count) values ('${episode}', '${season}', '${week}', 9, now() - interval '1 hour', 1);
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

describe("unapplied special-dances polish SQL", () => {
  beforeAll(async () => {
    db = await freshDb();
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  beforeEach(seedSeason);

  it("refuses a 0 mark, does not create a week draft, and can drop a judge after marks exist", async () => {
    const duel = await saveSpecial({
      danceType: "Challenge",
      name: "Cha-Cha Challenge",
      memberCoupleIds: [amber, julia],
      markMax: 10,
      panelJudgeIds: judges,
    });
    await expect(
      db.query("select public.save_team_marks($1, $2, $3, $4)", [
        episode,
        duel,
        friend,
        JSON.stringify([{ judgeId: judges[0], score: 0 }]),
      ])
    ).rejects.toThrow(/1 to 10 in steps of 0.5/);
    await db.query("select public.save_team_marks($1, $2, $3, $4)", [
      episode,
      duel,
      friend,
      JSON.stringify(judges.map((judgeId) => ({ judgeId, score: 8 }))),
    ]);
    expect((await db.query("select count(*)::int as n from public.draft_episode_overrides where episode_id = $1", [episode])).rows[0].n).toBe(0);
    await db.query("select public.save_special_dance_panel($1, $2, $3, $4)", [episode, duel, friend, [judges[0], judges[1]]]);
    expect((await db.query("select judge_id from public.episode_team_marks where team_id = $1 order by judge_id", [duel])).rows.map((r) => r.judge_id)).toEqual(
      [judges[0], judges[1]].sort()
    );
    expect((await db.query("select panel_judge_ids from public.episode_teams where id = $1", [duel])).rows[0].panel_judge_ids).toEqual([judges[0], judges[1]]);
  });
});
