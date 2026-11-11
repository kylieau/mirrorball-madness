import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1),
  manager = id(2),
  outsider = id(3),
  season = id(4),
  regularWeek = id(5),
  finaleWeek = id(6),
  league = id(7),
  [coupleA, coupleB, coupleC, coupleD] = [id(21), id(22), id(23), id(24)];

it("the Finale week takes a podium pick instead of an elimination pick", async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
  const schema = readFileSync("supabase/schema.sql", "utf8");
  const podium = readFileSync("supabase/apply-curtain-call-podium.sql", "utf8");
  await db.exec(
    schema
      .split("-- Atomic episode publication and score persistence.")[0]
      .replace('create extension if not exists "pgcrypto";', "")
      .replace(/alter publication supabase_realtime add table [^;]+;/g, "")
  );
  await db.exec(podium);
  await db.exec(podium);

  const functions = podium.slice(podium.indexOf("create or replace function"), podium.indexOf("\ncommit;"));
  for (const statement of functions.split(/\n(?=create or replace function)/)) {
    expect(schema).toContain(statement.replace(/\n-- The backfill follows[\s\S]*$/, "").trim());
  }

  await db.exec(`
    insert into auth.users(id, raw_user_meta_data) values
      ('${admin}', '{"display_name":"Admin"}'), ('${manager}', '{"display_name":"Manager"}'), ('${outsider}', '{"display_name":"Outsider"}');
    insert into public.profiles(id, display_name) values ('${admin}', 'Admin'), ('${manager}', 'Manager'), ('${outsider}', 'Outsider')
      on conflict (id) do nothing;
    update public.profiles set is_super_admin = true where id = '${admin}';
    insert into public.seasons(id, name, is_active) values ('${season}', 'S', true);
    insert into public.competition_weeks(id, season_id, week_number, is_finale) values
      ('${regularWeek}', '${season}', 1, false), ('${finaleWeek}', '${season}', 2, true);
    insert into public.episodes(id, season_id, episode_number, week_id, airs_at) values
      ('${id(11)}', '${season}', 1, '${regularWeek}', now() + interval '1 day'),
      ('${id(12)}', '${season}', 2, '${finaleWeek}', now() + interval '8 days');
    insert into public.people(id, name, role) values
      ('${id(31)}', 'A', 'celebrity'), ('${id(32)}', 'B', 'celebrity'), ('${id(33)}', 'C', 'celebrity'),
      ('${id(34)}', 'D', 'celebrity'), ('${id(35)}', 'P', 'pro');
    insert into public.couples(id, season_id, celebrity_id, pro_id) values
      ('${coupleA}', '${season}', '${id(31)}', '${id(35)}'), ('${coupleB}', '${season}', '${id(32)}', '${id(35)}'),
      ('${coupleC}', '${season}', '${id(33)}', '${id(35)}'), ('${coupleD}', '${season}', '${id(34)}', '${id(35)}');
    insert into public.leagues(id, name, commissioner_id, invite_code) values ('${league}', 'L', '${manager}', 'CODE01');
    insert into public.league_members(league_id, user_id, role) values ('${league}', '${manager}', 'commissioner')
      on conflict do nothing;
    insert into public.scoring_settings(league_id) values ('${league}') on conflict do nothing;
  `);

  const uuid = (value: string | null) => (value ? `'${value}'` : "null");
  const as = async (role: "authenticated" | "anon", uid: string | null, sql: string) => {
    try {
      await db.exec(`set test.uid = '${uid ?? ""}'; set role ${role}; ${sql}`);
    } finally {
      await db.exec("reset role");
    }
  };
  const submitPodium = (uid: string, week: string, picks: (string | null)[], topScorer: string | null = null) =>
    as(
      "authenticated",
      uid,
      `select public.submit_podium_prediction('${league}', '${week}', ${picks.map(uuid).join(", ")}, ${uuid(topScorer)});`
    );
  const submitElimination = (week: string, eliminated: string | null, topScorer: string | null) =>
    as(
      "authenticated",
      manager,
      `select public.submit_prediction('${league}', '${week}', ${uuid(eliminated)}, null, ${uuid(topScorer)});`
    );
  const saved = async () =>
    (await db.query<Record<string, string | null>>(`select * from public.predictions where week_id = '${finaleWeek}'`))
      .rows;

  await expect(submitElimination(finaleWeek, coupleA, null)).rejects.toThrow(/pick the podium instead/);
  await expect(submitPodium(manager, regularWeek, [coupleA, coupleB, coupleC])).rejects.toThrow(/Only the Finale/);
  await expect(submitPodium(manager, finaleWeek, [coupleA, coupleB, null])).rejects.toThrow(/all three podium places/);
  await expect(submitPodium(manager, finaleWeek, [coupleA, coupleB, coupleA])).rejects.toThrow(/three different/);
  await expect(submitPodium(outsider, finaleWeek, [coupleA, coupleB, coupleC])).rejects.toThrow(/not a member/);
  await db.exec(`
    insert into public.seasons(id, name, is_active) values ('${id(90)}', 'Earlier', false);
    insert into public.couples(id, season_id, celebrity_id, pro_id) values ('${id(91)}', '${id(90)}', '${id(31)}', '${id(35)}');
  `);
  await expect(submitPodium(manager, finaleWeek, [coupleA, coupleB, id(91)])).rejects.toThrow(/not in this season/);
  await expect(submitPodium(manager, finaleWeek, [coupleA, coupleB, coupleC], id(91))).rejects.toThrow(
    /not in this season/
  );
  await expect(
    as("anon", null, `select public.submit_podium_prediction('${league}', '${finaleWeek}', null, null, null, null);`)
  ).rejects.toThrow(/permission denied/);
  expect(await saved()).toHaveLength(0);

  await submitPodium(manager, finaleWeek, [coupleA, coupleB, coupleC], coupleD);
  expect((await saved())[0]).toMatchObject({
    predicted_eliminated_couple_id: null,
    predicted_winner_couple_id: coupleA,
    predicted_runner_up_couple_id: coupleB,
    predicted_third_place_couple_id: coupleC,
    predicted_top_scorer_couple_id: coupleD,
    entered_by: manager,
    entered_via: "app",
  });

  await submitElimination(finaleWeek, null, coupleB);
  expect((await saved())[0]).toMatchObject({
    predicted_winner_couple_id: coupleA,
    predicted_top_scorer_couple_id: coupleB,
  });

  await submitPodium(manager, finaleWeek, [null, null, null], coupleD);
  expect((await saved())[0]).toMatchObject({
    predicted_winner_couple_id: null,
    predicted_third_place_couple_id: null,
    predicted_top_scorer_couple_id: coupleD,
  });

  const backfillPodium = (uid: string, picks: (string | null)[]) =>
    as(
      "authenticated",
      uid,
      `select public.admin_backfill_podium_prediction('${league}', '${finaleWeek}', '${manager}', ${picks
        .map(uuid)
        .join(", ")}, null, now() - interval '1 hour', 'Texted me their podium');`
    );
  await expect(backfillPodium(manager, [coupleB, coupleC, coupleD])).rejects.toThrow(/Only a site admin/);
  await expect(backfillPodium(admin, [coupleB, coupleB, coupleD])).rejects.toThrow(/Invalid podium selections/);
  await expect(
    as(
      "authenticated",
      admin,
      `select public.admin_backfill_prediction('${league}', '${finaleWeek}', '${manager}', '${coupleA}', null, null, now() - interval '1 hour', 'Texted me their pick');`
    )
  ).rejects.toThrow(/record the podium instead/);
  await backfillPodium(admin, [coupleB, coupleC, coupleD]);
  expect((await saved())[0]).toMatchObject({
    predicted_winner_couple_id: coupleB,
    predicted_runner_up_couple_id: coupleC,
    predicted_third_place_couple_id: coupleD,
    predicted_top_scorer_couple_id: null,
    entered_by: admin,
    entered_via: "admin_backfill",
    entry_reason: "Texted me their podium",
  });

  await db.exec(`update public.episodes set airs_at = now() - interval '1 day' where week_id = '${finaleWeek}'`);
  await expect(submitPodium(manager, finaleWeek, [coupleA, coupleB, coupleC])).rejects.toThrow(/locked/);
}, 180_000);
