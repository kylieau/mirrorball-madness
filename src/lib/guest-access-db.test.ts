import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
it("anon reads only published season data", async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql as 'select null::uuid';`);
  const full = readFileSync("supabase/schema.sql", "utf8");
  const base = full.split("-- Atomic episode publication and score persistence.")[0]
    .replace('create extension if not exists "pgcrypto";', "")
    .replace(/alter publication supabase_realtime add table [^;]+;/g, "");
  const guest = full.split("-- Guest (signed-out) browsing of Home and Results.")[1];
  await db.exec(base);
  for (const t of ["seasons","competition_weeks","episodes","couples","people","dance_styles","dance_scores","episode_results","episode_in_jeopardy_couples","predictions","roster_slots","leagues"]) {
    await db.exec(`alter table public.${t} enable row level security;`);
  }
  await db.exec(guest);
  await db.exec(`
    insert into public.seasons(id, name, is_active) values ('${id(1)}', 'S', true);
    insert into public.competition_weeks(id, season_id, week_number) values ('${id(2)}', '${id(1)}', 1), ('${id(3)}', '${id(1)}', 2);
    insert into public.episodes(id, season_id, episode_number, week_id, airs_at, results_published_at, status) values
      ('${id(4)}', '${id(1)}', 1, '${id(2)}', now() - interval '8 days', now() - interval '7 days', 'completed'),
      ('${id(5)}', '${id(1)}', 2, '${id(3)}', now() - interval '1 hour', null, 'locked');
    insert into public.people(id, name, role) values ('${id(6)}', 'Celeb', 'celebrity'), ('${id(7)}', 'Pro', 'pro');
    insert into public.couples(id, season_id, celebrity_id, pro_id) values ('${id(8)}', '${id(1)}', '${id(6)}', '${id(7)}');
    insert into public.dance_styles(id, name) values ('${id(9)}', 'Waltz');
    insert into public.dance_scores(episode_id, couple_id, dance_style_id, total_score) values ('${id(4)}', '${id(8)}', '${id(9)}', 24), ('${id(5)}', '${id(8)}', '${id(9)}', 27);
    insert into public.episode_results(episode_id, couple_id, outcome) values ('${id(4)}', '${id(8)}', 'safe');
  `);
  await db.exec("set role anon");
  const scores = await db.query<{ total_score: number }>("select total_score from public.dance_scores order by total_score");
  expect(scores.rows.map((r) => Number(r.total_score))).toEqual([24]);
  expect((await db.query("select * from public.episode_results")).rows).toHaveLength(1);
  expect((await db.query("select * from public.couples")).rows).toHaveLength(1);
  expect((await db.query("select public.active_season_id() as s")).rows[0]).toEqual({ s: id(1) });
  for (const t of ["predictions", "roster_slots", "leagues", "league_members", "draft_dance_scores", "weekly_manager_scores", "profiles"]) {
    await expect(db.query(`select * from public.${t}`), t).rejects.toThrow(/permission denied/);
  }
  await expect(db.query("update public.couples set status = 'eliminated'")).rejects.toThrow(/permission denied/);
  await db.exec("reset role; set role authenticated");
  expect((await db.query("select * from public.dance_scores")).rows).toHaveLength(2);
}, 120_000);
