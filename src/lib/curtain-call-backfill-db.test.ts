import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1),
  manager = id(2),
  outsider = id(3),
  season = id(4),
  week = id(5),
  league = id(6),
  coupleA = id(7),
  coupleB = id(8);

it("admin_backfill_prediction records a site admin's backfill with provenance", async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
  const full = readFileSync("supabase/schema.sql", "utf8");
  await db.exec(
    full
      .split("-- Atomic episode publication and score persistence.")[0]
      .replace('create extension if not exists "pgcrypto";', "")
      .replace(/alter publication supabase_realtime add table [^;]+;/g, "")
  );
  const backfillFn = full.match(
    /create or replace function public\.admin_backfill_prediction[\s\S]*?grant execute on function public\.admin_backfill_prediction[^;]*;/
  );
  await db.exec(backfillFn![0]);
  await db.exec(`
    insert into auth.users(id, raw_user_meta_data) values
      ('${admin}', '{"display_name":"Admin"}'), ('${manager}', '{"display_name":"Manager"}'), ('${outsider}', '{"display_name":"Outsider"}');
    insert into public.profiles(id, display_name) values ('${admin}', 'Admin'), ('${manager}', 'Manager'), ('${outsider}', 'Outsider')
      on conflict (id) do nothing;
    update public.profiles set is_super_admin = true where id = '${admin}';
    insert into public.seasons(id, name, is_active) values ('${season}', 'S', true);
    insert into public.competition_weeks(id, season_id, week_number) values ('${week}', '${season}', 1);
    insert into public.people(id, name, role) values ('${id(9)}', 'A', 'celebrity'), ('${id(10)}', 'B', 'celebrity'), ('${id(11)}', 'P', 'pro');
    insert into public.couples(id, season_id, celebrity_id, pro_id) values
      ('${coupleA}', '${season}', '${id(9)}', '${id(11)}'), ('${coupleB}', '${season}', '${id(10)}', '${id(11)}');
    insert into public.leagues(id, name, commissioner_id, invite_code) values ('${league}', 'L', '${manager}', 'CODE01');
    insert into public.league_members(league_id, user_id, role) values ('${league}', '${manager}', 'commissioner')
      on conflict do nothing;
    insert into public.predictions(league_id, manager_id, week_id, predicted_eliminated_couple_id)
      values ('${league}', '${manager}', '${week}', '${coupleB}');
  `);

  const backfill = (uid: string, reason: string, madeAt = "now() - interval '1 hour'") =>
    db.exec(`set test.uid = '${uid}'; set role authenticated;
      select public.admin_backfill_prediction('${league}', '${week}', '${manager}', '${coupleA}', null, '${coupleB}', ${madeAt}, '${reason}');
      reset role;`);

  await expect(backfill(outsider, "Texted me their pick")).rejects.toThrow(/Only a site admin/);
  await db.exec("reset role");
  await expect(backfill(admin, "hi")).rejects.toThrow(/why it is being backfilled/);
  await db.exec("reset role");
  await expect(backfill(admin, "Texted me their pick", "now() + interval '1 hour'")).rejects.toThrow(
    /why it is being backfilled/
  );
  await db.exec("reset role");

  await backfill(admin, "  Texted me their pick  ");
  const { rows } = await db.query<{
    predicted_eliminated_couple_id: string;
    predicted_top_scorer_couple_id: string;
    entered_by: string;
    entered_via: string;
    entry_reason: string;
  }>("select * from public.predictions");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    predicted_eliminated_couple_id: coupleA,
    predicted_top_scorer_couple_id: coupleB,
    entered_by: admin,
    entered_via: "admin_backfill",
    entry_reason: "Texted me their pick",
  });
}, 180_000);
