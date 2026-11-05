import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fan = id(2);
const season = id(4), week8 = id(5), week9 = id(6), e09 = id(7), e10 = id(8);
const amber = id(32), julia = id(33);
let db: PGlite;

const schemaSql = readFileSync("supabase/schema.sql", "utf8")
  .replace('create extension if not exists "pgcrypto";', "")
  .replace(/alter publication supabase_realtime add table [^;]+;/g, "");

describe("unapplied draft lineup SQL", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; grant usage on schema auth to anon, authenticated, service_role;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;`);
    await db.exec(schemaSql);
    await db.exec(readFileSync("supabase/apply-draft-lineup.sql", "utf8"));
    await db.exec(readFileSync("supabase/apply-draft-lineup.sql", "utf8"));
    await db.exec(`
      insert into public.dance_styles(name, category) values ('Paso Doble', 'latin'), ('Jive', 'latin');
      insert into auth.users(id, email) values ('${fan}', 'fan@example.test');
      insert into public.seasons(id, name, is_active) values ('${season}', 'S35', true);
      insert into public.competition_weeks(id, season_id, week_number) values ('${week8}', '${season}', 8), ('${week9}', '${season}', 9);
      insert into public.episodes(id, season_id, week_id, episode_number, airs_at, results_published_at) values
        ('${e09}', '${season}', '${week8}', 9, now() - interval '2 days', now() - interval '1 day'),
        ('${e10}', '${season}', '${week9}', 10, now() + interval '5 days', null);
      insert into public.people(id, name, role) values
        ('${id(40)}', 'Amber', 'celebrity'), ('${id(41)}', 'Julia', 'celebrity'), ('${id(50)}', 'Pasha', 'pro'), ('${id(51)}', 'Ezra', 'pro');
      insert into public.couples(id, season_id, celebrity_id, pro_id) values
        ('${amber}', '${season}', '${id(40)}', '${id(50)}'), ('${julia}', '${season}', '${id(41)}', '${id(51)}');
      insert into public.draft_dance_scores(episode_id, couple_id, dance_style_id, song_title, total_score, scaled_score)
        select '${e10}', '${amber}', id, 'Bring Me to Life', 27, 27 from public.dance_styles where name = 'Paso Doble';
      insert into public.draft_dance_scores(episode_id, couple_id, dance_style_id, song_title, total_score, scaled_score)
        select '${e09}', '${julia}', id, 'Seed', 24, 24 from public.dance_styles where name = 'Jive';`);
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });

  it("gives a signed-in fan the unpublished week's style and song, never a score or a published week", async () => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${fan}', false);`);
    const { rows, fields } = await db.query<Record<string, unknown>>("select * from public.visible_draft_lineup()");
    await db.exec("reset role");
    expect(fields.map((f) => f.name)).toEqual(["episode_id", "week_id", "couple_id", "dance_style_name", "song_title", "created_at"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ episode_id: e10, week_id: week9, couple_id: amber, dance_style_name: "Paso Doble", song_title: "Bring Me to Life" });
  });

  it("refuses a signed-out guest", async () => {
    await db.exec("set role anon");
    await expect(db.query("select * from public.visible_draft_lineup()")).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  });
});
