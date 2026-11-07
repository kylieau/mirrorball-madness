import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { specialDanceFullName } from "./special-dance-names";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const season = id(1), week = id(2), episode = id(3), team = id(4), freestyle = id(5);
let db: PGlite;

// The files applied live, in order (as of 2026-11-07).
const LIVE_STACK = [
  "apply-audit-security", "apply-audit-deadlines", "apply-audit-settings", "apply-audit-prediction-provenance",
  "apply-curtain-call-backfill", "apply-curtain-call-backfill-lock-check", "apply-service-role-season-grants",
  "apply-drop-curtain-call-lock-guard", "apply-team-dance-entity", "apply-special-dances", "apply-special-dances-polish",
  "apply-draft-release-own-rows", "apply-whole-judge-marks", "apply-special-draft-release",
  "apply-contributor-special-setup", "apply-draft-lineup", "apply-retire-special-leftovers", "apply-episode-rounds",
];

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
  await db.exec(readFileSync("supabase/apply-special-dance-label.sql", "utf8"));
}, 60_000);

afterAll(async () => {
  await db?.close();
});

async function sqlLabel(name: string, danceType: string) {
  const { rows } = await db.query<{ label: string }>(
    `select public.special_dance_label(jsonb_populate_record(null::public.episode_teams, jsonb_build_object('name', $1::text, 'dance_type', $2::text))) as label`,
    [name, danceType]
  );
  return rows[0].label;
}

describe("special_dance_label", () => {
  it.each([
    ["Slaytopia", "Team Dance", "Team Dance · Slaytopia"],
    ["Team Dance 2", "Team Dance", "Team Dance 2"],
    ["Dance-Off 2", "Dance-Off", "Dance-Off 2"],
    ["Dance-Off Immunity", "Dance-Off", "Dance-Off Immunity"],
    ["Villains", "Trio", "Trio · Villains"],
    ["the big dance-off", "Dance-Off", "the big dance-off"],
    ["  Slaytopia ", " Team Dance ", "Team Dance · Slaytopia"],
    ["", "Marathon", "Marathon"],
  ])("names %j (%s) the way the app does", async (name, danceType, expected) => {
    expect(specialDanceFullName({ name, danceType })).toBe(expected);
    expect(await sqlLabel(name, danceType)).toBe(expected);
  });

  it("names the dance in Finish Week's blocker", async () => {
    await db.exec(`truncate public.dance_styles cascade;
      insert into public.dance_styles(id, name, category) values ('${freestyle}', 'Freestyle', 'show');
      insert into public.seasons(id, name, is_active) values ('${season}', 'S35', true);
      insert into public.competition_weeks(id, season_id, week_number) values ('${week}', '${season}', 9);
      insert into public.episodes(id, season_id, week_id, episode_number, airs_at) values ('${episode}', '${season}', '${week}', 10, now());
      insert into public.episode_teams(id, episode_id, name, dance_type, dance_style_id) values ('${team}', '${episode}', 'Slaytopia', 'Team Dance', '${freestyle}');`);
    const { rows } = await db.query<{ message: string }>(
      `select public.special_dance_blocker($1, 'before finishing the week') as message`,
      [team]
    );
    expect(rows[0].message).toMatch(/^Team Dance · Slaytopia needs 2 to 4 judges/);
  });
});
