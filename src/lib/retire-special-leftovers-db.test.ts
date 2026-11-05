import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRevealPlan, buildTeamRevealPlan } from "./episode-reveal";
import { buildPublicationPlan, type PublicationSnapshot } from "./episode-publication";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1), friend = id(2);
const season = id(4), week = id(5), episode = id(6), league = id(7), contemporary = id(8), freestyle = id(9);
const judges = [id(20), id(21), id(22)], guest = id(23);
const [tatyana, maura, amber, julia] = [id(30), id(31), id(32), id(33)];
const nightJudges = [...judges, guest];
let db: PGlite;
let preMigrationTeam: string;

// The files applied live, in order, so the functions this migration replaces
// start out exactly as production has them (compared 2026-11-05).
const LIVE_STACK = [
  "apply-audit-security", "apply-audit-deadlines", "apply-audit-settings", "apply-audit-prediction-provenance",
  "apply-curtain-call-backfill", "apply-curtain-call-backfill-lock-check", "apply-service-role-season-grants",
  "apply-drop-curtain-call-lock-guard", "apply-team-dance-entity", "apply-special-dances", "apply-special-dances-polish",
  "apply-draft-release-own-rows", "apply-whole-judge-marks", "apply-special-draft-release",
  "apply-contributor-special-setup", "apply-draft-lineup",
];
const migrationSql = readFileSync("supabase/apply-retire-special-leftovers.sql", "utf8");

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

async function seedSeason() {
  await db.exec(`truncate public.dance_styles cascade;
    insert into public.dance_styles(id, name, category) values ('${freestyle}', 'Freestyle', 'show'), ('${contemporary}', 'Contemporary', 'show');
    insert into auth.users(id, email) values ('${admin}', 'admin@example.test'), ('${friend}', 'friend@example.test');
    update public.profiles set is_super_admin = true where id = '${admin}';
    update public.profiles set can_propose_results = true where id = '${friend}';
    insert into public.seasons(id, name, is_active) values ('${season}', 'S35', true);
    insert into public.competition_weeks(id, season_id, week_number) values ('${week}', '${season}', 9);
    insert into public.episodes(id, season_id, week_id, episode_number, airs_at, expected_dance_count) values ('${episode}', '${season}', '${week}', 10, now() - interval '1 hour', 1);
    insert into public.people(id, name, role) values
      ('${judges[0]}', 'Carrie Ann Inaba', 'judge'), ('${judges[1]}', 'Derek Hough', 'judge'), ('${judges[2]}', 'Bruno Tonioli', 'judge');
    insert into public.people(id, name, role, archived_at) values ('${guest}', 'Guest Judge', 'judge', now());
    insert into public.episode_guest_judges(episode_id, judge_id) values ('${episode}', '${guest}');
    insert into public.people(id, name, role) select ('00000000-0000-4000-8000-' || lpad((40 + n)::text, 12, '0'))::uuid, 'Celebrity ' || n, 'celebrity' from generate_series(0, 3) n;
    insert into public.people(id, name, role) select ('00000000-0000-4000-8000-' || lpad((50 + n)::text, 12, '0'))::uuid, 'Pro ' || n, 'pro' from generate_series(0, 3) n;
    insert into public.couples(id, season_id, celebrity_id, pro_id)
      select ('00000000-0000-4000-8000-' || lpad((30 + n)::text, 12, '0'))::uuid, '${season}',
             ('00000000-0000-4000-8000-' || lpad((40 + n)::text, 12, '0'))::uuid, ('00000000-0000-4000-8000-' || lpad((50 + n)::text, 12, '0'))::uuid
      from generate_series(0, 3) n;
    insert into public.leagues(id, name, invite_code, commissioner_id) values ('${league}', 'Test', 'TEST', '${admin}');
    insert into public.league_members(league_id, user_id, role) values ('${league}', '${admin}', 'commissioner'), ('${league}', '${friend}', 'manager');
    insert into public.scoring_settings(league_id, judges_score_multiplier, survival_points) values ('${league}', 1, 0);
    insert into public.roster_slots(league_id, manager_id, slot_number, couple_id, source, start_week) values
      ('${league}', '${admin}', 1, '${amber}', 'draft', 1), ('${league}', '${friend}', 1, '${julia}', 'draft', 1);`);
}

async function saveSpecial(dance: Record<string, unknown>, actor = admin): Promise<string> {
  return (await db.query<{ id: string }>("select public.save_special_dance($1, $2, $3) as id", [episode, actor, JSON.stringify(dance)])).rows[0].id;
}
async function saveMarks(teamId: string, scores: number[]) {
  const marks = scores.map((score, i) => ({ judgeId: nightJudges[i], score }));
  await db.query("select public.save_team_marks($1, $2, $3, $4)", [episode, teamId, friend, JSON.stringify(marks)]);
}
async function savePoints(teamId: string, scores: { coupleId: string; points: number; result: string }[]) {
  await db.query("select public.save_special_dance_points($1, $2, $3, $4)", [episode, teamId, friend, JSON.stringify(scores)]);
}
async function ownDances(couples: string[]) {
  const entries = couples.map((coupleId, i) => ({
    coupleId, outcome: "safe", savedByJudges: false, hadImmunity: false, bonusPoints: 0, bonusNote: null,
    dances: [{ danceStyleId: contemporary, songTitle: `Song ${i}`, judgeScores: [8, 8, 9, 8].map((score, j) => ({ judgeId: nightJudges[j], score })) }],
  }));
  await db.query("select public.save_episode_draft_checked($1)", [
    JSON.stringify({ episodeId: episode, updatedBy: friend, guestJudgeName: null, judgesSaveAvailable: false, inJeopardyCoupleIds: [], entries, correctionToken: null }),
  ]);
}
async function snapshot(): Promise<PublicationSnapshot> {
  return (await db.query<{ data: PublicationSnapshot }>("select public.episode_publication_snapshot($1) as data", [episode])).rows[0].data;
}
async function revealCouple(coupleId: string, undo = false) {
  const data = await snapshot();
  await db.query("select public.commit_episode_reveal($1, $2, $3, $4, $5, $6)", [episode, coupleId, admin, JSON.stringify(data), JSON.stringify(buildRevealPlan(data, episode, coupleId, undo)), undo]);
}
async function revealTeam(teamId: string, undo = false) {
  const data = await snapshot();
  await db.query("select public.commit_team_reveal($1, $2, $3, $4, $5, $6)", [episode, teamId, admin, JSON.stringify(data), JSON.stringify(buildTeamRevealPlan(data, episode, teamId, undo)), undo]);
}
async function finishWeek() {
  const data = await snapshot();
  await db.query("select public.commit_episode_publication($1, $2, $3, $4)", [episode, admin, JSON.stringify(data), JSON.stringify(buildPublicationPlan(data, episode))]);
}
async function liveRows(coupleId: string) {
  return (await db.query<{ total: number; scaled: number; max: number | null; team_id: string | null; judges: number }>(
    `select d.total_score::float as total, d.scaled_score::float as scaled, d.max_score::float as max, d.team_id,
       (select count(*) from public.judge_scores j where j.dance_score_id = d.id)::int as judges
     from public.dance_scores d where d.episode_id = $1 and d.couple_id = $2 order by d.team_id is not null, d.max_score desc`, [episode, coupleId])).rows;
}
async function rosterPoints(managerId: string) {
  return (await db.query<{ p: number }>("select roster_points::float as p from public.weekly_manager_scores where manager_id = $1", [managerId])).rows[0]?.p ?? null;
}

describe("apply-retire-special-leftovers.sql", () => {
  beforeAll(async () => {
    db = await freshDb();
    await seedSeason();
    preMigrationTeam = await saveSpecial({
      danceType: "Team Dance", name: "Slaytopia", memberCoupleIds: [tatyana, amber, julia],
      songs: [{ title: "Zoo", artist: "Shakira" }, { title: "Try Everything", artist: null }],
    });
    await db.exec(migrationSql);
    await db.exec(migrationSql); // Dashboard reruns must be safe.
  }, 60_000);
  afterAll(async () => db?.close());

  it("drops the columns, tables and function, strips artists and keeps the special-dance checks", async () => {
    const columns = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'episode_teams' and column_name = any($1)",
      [["mark_max", "panel_judge_ids", "song_source", "theme_label"]]
    );
    expect(columns.rows).toEqual([]);
    const tables = await db.query("select 1 from pg_tables where schemaname = 'public' and tablename like '%custom_moments'");
    expect(tables.rows).toEqual([]);
    expect((await db.query("select 1 from pg_proc where proname = 'mutate_draft_moment'")).rows).toEqual([]);
    const sources = await db.query<{ prosrc: string }>("select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'");
    expect(sources.rows.filter((r) => /mark_max|panel_judge_ids|song_source|theme_label|custom_moment/.test(r.prosrc))).toEqual([]);
    expect((await db.query("select songs from public.episode_teams where id = $1", [preMigrationTeam])).rows[0]).toEqual({ songs: [{ title: "Zoo" }, { title: "Try Everything" }] });
    await expect(db.query("update public.episode_teams set scoring_mode = 'stars' where id = $1", [preMigrationTeam])).rejects.toThrow(/episode_teams_special_checks/);
    await expect(db.query(`update public.episode_teams set songs = '[{},{},{},{},{}]' where id = $1`, [preMigrationTeam])).rejects.toThrow(/episode_teams_special_checks/);
    expect(await snapshot()).not.toHaveProperty("draftMoments");
  });

  it("saves a special dance without the retired fields, ignoring them when an old tab still sends them", async () => {
    const trio = await saveSpecial(
      { danceType: "Trio", memberCoupleIds: [maura], markMax: 8, panelJudgeIds: [judges[0]], songSource: "Film", themeLabel: "Era", songs: [{ title: "Sway", artist: "Bublé" }] },
      friend
    );
    expect((await db.query("select name, scoring_mode, songs from public.episode_teams where id = $1", [trio])).rows[0]).toEqual({ name: "Trio", scoring_mode: "marks", songs: [{ title: "Sway" }] });
    await saveSpecial({ id: trio, scoringMode: "points" }, friend);
    await saveMarks(preMigrationTeam, [9]);
    await expect(saveSpecial({ id: preMigrationTeam, scoringMode: "points" })).rejects.toThrow(/Clear the saved scores of Team Slaytopia/);
    await saveMarks(preMigrationTeam, []);
    await db.query("select public.delete_special_dance($1, $2, $3)", [episode, trio, admin]);
  });

  it("posts and un-posts couples and specials, finishes the week, seeds a correction and republishes", async () => {
    const danceOff = await saveSpecial({ danceType: "Dance-Off", memberCoupleIds: [amber, julia], scoringMode: "points" }, friend);
    await ownDances([tatyana, maura, amber, julia]);

    await revealCouple(amber);
    expect(await liveRows(amber)).toMatchObject([{ total: 33, max: null, team_id: null, judges: 4 }]);
    await revealCouple(amber, true);
    expect(await liveRows(amber)).toEqual([]);
    for (const couple of [tatyana, maura, amber, julia]) await revealCouple(couple);

    // Marks are out of 10 on the night's four judges: 36/40.
    await saveMarks(preMigrationTeam, [9, 9, 9, 9]);
    await revealTeam(preMigrationTeam);
    expect((await liveRows(amber)).filter((r) => r.team_id === preMigrationTeam)).toMatchObject([{ total: 36, scaled: 27, max: 40, judges: 4 }]);
    await revealTeam(preMigrationTeam, true);
    expect((await liveRows(amber)).map((r) => r.team_id)).toEqual([null]);
    await revealTeam(preMigrationTeam);

    // The dance-off loser is an explicit 0; Finish Week posts it.
    await savePoints(danceOff, [{ coupleId: amber, points: 3, result: "Winner" }, { coupleId: julia, points: 0, result: "Loser" }]);
    await finishWeek();
    expect((await liveRows(amber)).filter((r) => r.team_id === danceOff)).toMatchObject([{ total: 3, scaled: 0, max: 0, judges: 0 }]);
    expect((await liveRows(julia)).filter((r) => r.team_id === danceOff)).toMatchObject([{ total: 0, scaled: 0, max: 0, judges: 0 }]);
    expect((await db.query("select count(*)::int as n from public.episode_teams where episode_id = $1 and posted_at is null", [episode])).rows[0]).toEqual({ n: 0 });
    // Amber: 33 + 36 + 3 bonus = 72/80 -> 27. Julia: 33 + 36 + 0 = 69/80 -> 25.875.
    expect(await rosterPoints(admin)).toBe(27);
    expect(await rosterPoints(friend)).toBeCloseTo(25.88, 2);

    const token = (await db.query<{ token: string }>("select public.seed_episode_correction($1, $2) as token", [episode, admin])).rows[0].token;
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    expect((await db.query("select count(*)::int as n from public.draft_dance_scores where episode_id = $1", [episode])).rows[0]).toEqual({ n: 4 });
    await finishWeek();
    expect(await rosterPoints(admin)).toBe(27);
    expect((await liveRows(amber)).map((r) => r.team_id)).toEqual([null, preMigrationTeam, danceOff]);

    const data = await snapshot();
    const rows = (await db.query("select league_id, manager_id, week_id, roster_points, prediction_points, grand_finale_points, total_points from public.weekly_manager_scores")).rows;
    await db.query("select public.replace_weekly_scores($1, $2, $3)", [episode, data._revision, JSON.stringify(rows)]);
    expect(await rosterPoints(admin)).toBe(27);
  });
});
