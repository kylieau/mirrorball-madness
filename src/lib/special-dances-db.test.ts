import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildRevealPlan, buildTeamRevealPlan } from "./episode-reveal";
import { buildPublicationPlan, type PublicationSnapshot } from "./episode-publication";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1), friend = id(2), outsider = id(3);
const season = id(4), week = id(5), episode = id(6), league = id(7), contemporary = id(8);
const judges = [id(20), id(21), id(22)], guest = id(23);
// Tatyana, Maura, Amber, Julia (Slaytopia); Connor, Ezra (Wildcats); Whitney withdrew.
const [tatyana, maura, amber, julia, connor, ezra, whitney] = [id(30), id(31), id(32), id(33), id(34), id(35), id(36)];
let db: PGlite;

const schemaSql = readFileSync("supabase/schema.sql", "utf8")
  .replace('create extension if not exists "pgcrypto";', "")
  .replace(/alter publication supabase_realtime add table [^;]+;/g, "");
const entitySql = readFileSync("supabase/apply-team-dance-entity.sql", "utf8");
const specialSql = readFileSync("supabase/apply-special-dances.sql", "utf8");

async function freshDb(withSpecial: boolean) {
  const instance = new PGlite();
  await instance.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;`);
  await instance.exec(schemaSql);
  await instance.exec(entitySql);
  if (withSpecial) {
    await instance.exec(specialSql);
    await instance.exec(specialSql); // Dashboard reruns must be safe.
  }
  return instance;
}

async function seedSeason() {
  await db.exec(`reset role; truncate public.seasons, public.leagues, auth.users, public.people, public.dance_styles cascade;
    insert into public.dance_styles(name, category) values ('Freestyle', 'show');
    insert into auth.users(id, email) values ('${admin}', 'admin@example.test'), ('${friend}', 'friend@example.test'), ('${outsider}', 'outsider@example.test');
    update public.profiles set is_super_admin = true where id = '${admin}';
    update public.profiles set can_propose_results = true where id = '${friend}';
    insert into public.seasons(id, name, is_active) values ('${season}', 'S35', true);
    insert into public.competition_weeks(id, season_id, week_number) values ('${week}', '${season}', 8);
    insert into public.episodes(id, season_id, week_id, episode_number, airs_at, expected_dance_count) values ('${episode}', '${season}', '${week}', 9, now() - interval '1 hour', 1);
    insert into public.people(id, name, role) values
      ('${judges[0]}', 'Carrie Ann Inaba', 'judge'), ('${judges[1]}', 'Derek Hough', 'judge'), ('${judges[2]}', 'Bruno Tonioli', 'judge');
    insert into public.people(id, name, role, archived_at) values ('${guest}', 'Cynthia Erivo', 'judge', now());
    insert into public.episode_guest_judges(episode_id, judge_id) values ('${episode}', '${guest}');
    insert into public.people(id, name, role) select ('00000000-0000-4000-8000-' || lpad((40 + n)::text, 12, '0'))::uuid, 'Celebrity ' || n, 'celebrity' from generate_series(0, 6) n;
    insert into public.people(id, name, role) select ('00000000-0000-4000-8000-' || lpad((50 + n)::text, 12, '0'))::uuid, 'Pro ' || n, 'pro' from generate_series(0, 6) n;
    insert into public.couples(id, season_id, celebrity_id, pro_id)
      select ('00000000-0000-4000-8000-' || lpad((30 + n)::text, 12, '0'))::uuid, '${season}',
             ('00000000-0000-4000-8000-' || lpad((40 + n)::text, 12, '0'))::uuid, ('00000000-0000-4000-8000-' || lpad((50 + n)::text, 12, '0'))::uuid
      from generate_series(0, 6) n;
    update public.couples set status = 'withdrawn', elimination_week = 7 where id = '${whitney}';
    insert into public.dance_styles(id, name, category) values ('${contemporary}', 'Contemporary', 'show');
    insert into public.leagues(id, name, invite_code, commissioner_id) values ('${league}', 'Test', 'TEST', '${admin}');
    insert into public.league_members(league_id, user_id, role) values ('${league}', '${admin}', 'commissioner'), ('${league}', '${friend}', 'manager');
    insert into public.scoring_settings(league_id, judges_score_multiplier, survival_points) values ('${league}', 1, 0);
    insert into public.roster_slots(league_id, manager_id, slot_number, couple_id, source, start_week) values
      ('${league}', '${admin}', 1, '${amber}', 'draft', 1), ('${league}', '${friend}', 1, '${julia}', 'draft', 1);`);
}

type LegacyTeam = {
  id?: string | null; name: string; songTitle?: string | null; songSource?: string | null;
  danceStyleId?: string | null; captainCoupleId?: string | null; hostName?: string | null; memberCoupleIds: string[]; sortOrder?: number;
};
const slaytopia = (overrides: Partial<LegacyTeam> = {}): LegacyTeam => ({
  name: "Slaytopia", songTitle: "Zoo", songSource: "Zootopia 2", captainCoupleId: tatyana, hostName: "Alfonso Ribeiro",
  memberCoupleIds: [tatyana, maura, amber, julia], ...overrides,
});
const wildcats = (overrides: Partial<LegacyTeam> = {}): LegacyTeam => ({
  name: "Wildcats", songTitle: "We're All in This Together", captainCoupleId: connor, memberCoupleIds: [connor, ezra, whitney], ...overrides,
});
const marks = (scores: number[], judgeIds = [...judges, guest]) => scores.map((score, i) => ({ judgeId: judgeIds[i], score }));

async function saveTeams(teams: LegacyTeam[], actor = admin): Promise<{ teamIds: string[] }> {
  return (await db.query<{ data: { teamIds: string[] } }>("select public.save_episode_teams($1, $2, $3) as data", [episode, actor, JSON.stringify(teams)])).rows[0].data;
}
async function saveSpecial(dance: Record<string, unknown>, actor = admin): Promise<string> {
  return (await db.query<{ id: string }>("select public.save_special_dance($1, $2, $3) as id", [episode, actor, JSON.stringify(dance)])).rows[0].id;
}
async function saveMarks(teamId: string, scores: number[], judgeIds = [...judges, guest], actor = friend) {
  await db.query("select public.save_team_marks($1, $2, $3, $4)", [episode, teamId, actor, JSON.stringify(marks(scores, judgeIds))]);
}
async function savePoints(teamId: string, scores: { coupleId: string; points: number | null; result?: string | null }[], actor = friend) {
  await db.query("select public.save_special_dance_points($1, $2, $3, $4)", [episode, teamId, actor, JSON.stringify(scores)]);
}
function entry(coupleId: string, dances: { style: string; song: string; scores: number[] }[], outcome = "safe") {
  return { coupleId, outcome, savedByJudges: false, hadImmunity: false, bonusPoints: 0, bonusNote: null,
    dances: dances.map((d) => ({ danceStyleId: d.style, songTitle: d.song, judgeScores: d.scores.length ? marks(d.scores) : [] })) };
}
async function checkedSave(entries: ReturnType<typeof entry>[], actor = friend, correctionToken: string | null = null) {
  return (await db.query<{ data: { acknowledged: string[]; skippedPosted: string[] } }>("select public.save_episode_draft_checked($1) as data", [
    JSON.stringify({ episodeId: episode, updatedBy: actor, guestJudgeName: null, judgesSaveAvailable: false, inJeopardyCoupleIds: [], entries, correctionToken }),
  ])).rows[0].data;
}
async function ownDances(couples: string[]) {
  await checkedSave(couples.map((c, i) => entry(c, [{ style: contemporary, song: `Song ${i}`, scores: [8, 8, 9, 8] }])));
}
async function liveRows(coupleId: string) {
  return (await db.query<{ style: string; total: number; scaled: number; max: number | null; team_id: string | null; judges: number }>(
    `select d.dance_style_id as style, d.total_score::float as total, d.scaled_score::float as scaled, d.max_score::float as max, d.team_id,
       (select count(*) from public.judge_scores j where j.dance_score_id = d.id)::int as judges
     from public.dance_scores d where d.episode_id = $1 and d.couple_id = $2 order by d.team_id nulls first, coalesce(d.max_score, 1) desc, d.total_score desc`, [episode, coupleId])).rows;
}
async function snapshot(): Promise<PublicationSnapshot> {
  return (await db.query<{ data: PublicationSnapshot }>("select public.episode_publication_snapshot($1) as data", [episode])).rows[0].data;
}
async function revealCouple(coupleId: string, undo = false) {
  const data = await snapshot();
  await db.query("select public.commit_episode_reveal($1, $2, $3, $4, $5, $6)", [episode, coupleId, admin, JSON.stringify(data), JSON.stringify(buildRevealPlan(data, episode, coupleId, undo)), undo]);
}
async function revealTeam(teamId: string, undo = false, data?: PublicationSnapshot) {
  const snap = data ?? (await snapshot());
  await db.query("select public.commit_team_reveal($1, $2, $3, $4, $5, $6)", [episode, teamId, admin, JSON.stringify(snap), JSON.stringify(buildTeamRevealPlan(snap, episode, teamId, undo)), undo]);
}
async function finishWeek() {
  const data = await snapshot();
  await db.query("select public.commit_episode_publication($1, $2, $3, $4)", [episode, admin, JSON.stringify(data), JSON.stringify(buildPublicationPlan(data, episode))]);
}
async function rosterPoints(managerId: string) {
  return (await db.query<{ p: number }>("select roster_points::float as p from public.weekly_manager_scores where manager_id = $1", [managerId])).rows[0]?.p ?? null;
}
async function postedAt(teamId: string) {
  return (await db.query<{ posted_at: string | null }>("select posted_at from public.episode_teams where id = $1", [teamId])).rows[0].posted_at;
}
async function team(teamId: string) {
  return (await db.query<Record<string, unknown>>(
    `select name, name_is_auto, dance_type, scoring_mode, mark_max::float as mark_max, panel_judge_ids, song_title, song_source, theme_label, host_name,
       captain_couple_id, second_dance_style_id, songs, details, sort_order,
       (select array_agg(couple_id order by sort_order) from public.episode_team_members m where m.team_id = t.id) as members
     from public.episode_teams t where id = $1`, [teamId])).rows[0];
}
// The freeze's §2.5 verification queries, as one object so before and after compare with a single assertion.
async function verificationMetrics() {
  const [teams, members, marksAgg, tagged] = await Promise.all([
    db.query<{ teams: number; posted: number }>("select count(*)::int teams, count(*) filter (where posted_at is not null)::int posted from public.episode_teams"),
    db.query<{ n: number }>("select count(*)::int n from public.episode_team_members"),
    db.query<{ n: number; sum: number }>("select count(*)::int n, coalesce(sum(score), 0)::float sum from public.episode_team_marks"),
    db.query<{ n: number; total: number; scaled: number }>("select count(*)::int n, coalesce(sum(total_score), 0)::float total, coalesce(sum(scaled_score), 0)::float scaled from public.dance_scores where team_id is not null"),
  ]);
  const rows = await db.query("select id, name, song_title, song_source, host_name, captain_couple_id from public.episode_teams order by name");
  return { ...teams.rows[0], members: members.rows[0].n, marks: marksAgg.rows[0], tagged: tagged.rows[0], rows: rows.rows };
}

describe("apply-special-dances.sql on a live Disney Night", () => {
  beforeAll(async () => {
    db = await freshDb(false);
    await seedSeason();
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });

  it("migrates the shipped teams with zero diffs in the verification queries, then keeps scoring them the same", async () => {
    // Before: the entity model as it ran on Week 8 (whole-episode saves, four marks, one team posted).
    const [team1, cats] = (await saveTeams([slaytopia(), wildcats()])).teamIds;
    await ownDances([tatyana, amber, julia, connor, ezra]);
    await checkedSave([entry(maura, [], "bye")]);
    await saveMarks(team1, [9, 9, 9, 9]);
    await saveMarks(cats, [8, 8, 8]);
    await revealTeam(team1);
    const before = await verificationMetrics();
    expect(before).toMatchObject({ teams: 2, posted: 1, members: 7, marks: { n: 7, sum: 60 }, tagged: { n: 3, total: 108, scaled: 81 } });

    await db.exec(specialSql);
    await db.exec(specialSql);

    const after = await verificationMetrics();
    expect(after).toEqual(before);
    // The backups hold the pre-migration rows and are hidden from the API roles.
    expect((await db.query<{ n: number }>("select count(*)::int n from public._backup_20261103_episode_teams")).rows[0].n).toBe(2);
    expect((await db.query<{ n: number }>("select count(*)::int n from public._backup_20261103_episode_team_marks")).rows[0].n).toBe(7);
    // Lossless backfill: the song, captain (with the couple id) and host now also live in songs and details.
    expect(await team(team1)).toMatchObject({
      dance_type: "Team Dance", scoring_mode: "marks", mark_max: 10, panel_judge_ids: null, name_is_auto: false,
      song_title: "Zoo", songs: [{ title: "Zoo", artist: null }], song_source: "Zootopia 2", host_name: "Alfonso Ribeiro", captain_couple_id: tatyana,
      details: [{ label: "Captain", value: "Celebrity 0", coupleId: tatyana }, { label: "Host", value: "Alfonso Ribeiro" }],
    });
    expect(await team(cats)).toMatchObject({ songs: [{ title: "We're All in This Together", artist: null }], details: [{ label: "Captain", value: "Celebrity 4", coupleId: connor }] });
    // The unique (episode_id, couple_id) rule is gone and the constraint is in place.
    expect((await db.query<{ conname: string }>("select conname from pg_constraint where conrelid = 'public.episode_team_members'::regclass")).rows.map((r) => r.conname))
      .not.toContain("episode_team_members_episode_id_couple_id_key");
    expect((await db.query<{ n: number }>("select count(*)::int n from pg_constraint where conname = 'episode_teams_special_checks'")).rows[0].n).toBe(1);

    // A posted team's rows keep max_score null until it is touched; re-posting writes 40 with the same totals.
    expect((await liveRows(amber)).filter((r) => r.team_id === team1)).toMatchObject([{ total: 36, scaled: 27, max: null, judges: 4 }]);
    await revealTeam(team1);
    expect((await liveRows(amber)).filter((r) => r.team_id === team1)).toMatchObject([{ total: 36, scaled: 27, max: 40, judges: 4 }]);
    // Wildcats still needs its fourth mark, by name, exactly as before.
    await expect(revealTeam(cats)).rejects.toThrow(/Team Wildcats has 3 of 4 marks/);
    await saveMarks(cats, [8, 8, 8, 8]);
    await finishWeek();
    expect((await liveRows(connor)).map((r) => [r.total, r.max, r.team_id])).toEqual([[33, null, null], [32, 40, cats]]);
    expect(await rosterPoints(admin)).toBe(25.88); // Amber: 33 + 36 over 80.
    expect(await rosterPoints(friend)).toBe(25.88); // Julia: the same night.
  }, 60000);
});

describe("special dances in PostgreSQL", () => {
  beforeAll(async () => {
    db = await freshDb(true);
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  beforeEach(seedSeason);

  it("still accepts an old Edit Teams payload and mirrors its legacy keys into songs and details", async () => {
    const [team1] = (await saveTeams([slaytopia()])).teamIds;
    expect(await team(team1)).toMatchObject({
      name: "Slaytopia", dance_type: "Team Dance", scoring_mode: "marks", mark_max: 10, song_title: "Zoo",
      songs: [{ title: "Zoo", artist: null }], details: [{ label: "Captain", value: "Celebrity 0", coupleId: tatyana }, { label: "Host", value: "Alfonso Ribeiro" }],
      captain_couple_id: tatyana, host_name: "Alfonso Ribeiro", members: [tatyana, maura, amber, julia],
    });
    // A legacy rename of the song rewrites the first song; dropping the host drops its detail; the Captain stays.
    await saveTeams([{ ...slaytopia({ songTitle: "Try Everything", hostName: null }), id: team1 }]);
    expect(await team(team1)).toMatchObject({
      song_title: "Try Everything", songs: [{ title: "Try Everything", artist: null }], host_name: null,
      details: [{ label: "Captain", value: "Celebrity 0", coupleId: tatyana }],
    });
    // Teams missing from a whole-episode save are removed; the one-team-per-couple rule is gone.
    const { teamIds } = await saveTeams([{ ...slaytopia(), id: team1 }, wildcats({ memberCoupleIds: [connor, amber] })]);
    expect(teamIds).toHaveLength(2);
    await saveTeams([{ ...slaytopia(), id: team1 }]);
    expect((await db.query("select id from public.episode_teams")).rows).toHaveLength(1);
    await expect(saveTeams([slaytopia({ captainCoupleId: connor })])).rejects.toThrow(/captain must be on the team/);
    await expect(saveTeams([slaytopia()], friend)).rejects.toThrow(/Only a site admin/);
  });

  it("upserts one special dance inline, names a blank one after its type, and keeps absent keys", async () => {
    const danceOff = await saveSpecial({ danceType: "Dance-Off", name: "", memberCoupleIds: [amber, julia], scoringMode: "points" });
    expect(await team(danceOff)).toMatchObject({ name: "Dance-Off", name_is_auto: true, dance_type: "Dance-Off", scoring_mode: "points", panel_judge_ids: null, members: [amber, julia] });
    const second = await saveSpecial({ danceType: "Dance-Off", name: "", memberCoupleIds: [connor], scoringMode: "points" });
    expect(await team(second)).toMatchObject({ name: "Dance-Off 2", name_is_auto: true, sort_order: 2 });
    // A couple may now be in two special dances in one night.
    const marathon = await saveSpecial({
      danceType: "Marathon", name: "", memberCoupleIds: [amber, connor, ezra], scoringMode: "marks", markMax: 8, panelJudgeIds: judges,
      danceStyleId: contemporary, secondDanceStyleId: null, songs: [{ title: "Footloose", artist: "Kenny Loggins" }, { title: "Shake It Off", artist: "" }],
      songSource: "The 80s", themeLabel: "Era", details: [{ label: "Host", value: "Julianne Hough" }, { label: "Captain", value: "Celebrity 2", coupleId: amber }],
    });
    expect(await team(marathon)).toMatchObject({
      name: "Marathon", mark_max: 8, panel_judge_ids: judges, song_title: "Footloose", song_source: "The 80s", theme_label: "Era",
      songs: [{ title: "Footloose", artist: "Kenny Loggins" }, { title: "Shake It Off", artist: null }],
      details: [{ label: "Host", value: "Julianne Hough" }, { label: "Captain", value: "Celebrity 2", coupleId: amber }], host_name: "Julianne Hough", captain_couple_id: amber,
    });
    // Absent keys keep their stored values; a present blank name re-derives the automatic label from the new type.
    await saveSpecial({ id: marathon, danceType: "Relay", name: "" });
    expect(await team(marathon)).toMatchObject({ name: "Relay", dance_type: "Relay", mark_max: 8, songs: [{ title: "Footloose", artist: "Kenny Loggins" }, { title: "Shake It Off", artist: null }], members: [amber, connor, ezra] });
    // Validation mirrors the inline editor's.
    await expect(saveSpecial({ danceType: "", memberCoupleIds: [amber] })).rejects.toThrow(/Dance Type must be 1 to 40/);
    await expect(saveSpecial({ danceType: "Trio", memberCoupleIds: [] })).rejects.toThrow(/at least one participant/);
    await expect(saveSpecial({ danceType: "Trio", memberCoupleIds: [id(99)] })).rejects.toThrow(/not in this season/);
    await expect(saveSpecial({ danceType: "Trio", name: "relay", memberCoupleIds: [amber] })).rejects.toThrow(/already called "relay"/);
    await expect(saveSpecial({ danceType: "Trio", memberCoupleIds: [amber], markMax: 10.25 })).rejects.toThrow(/steps of 0.5/);
    await expect(saveSpecial({ danceType: "Trio", memberCoupleIds: [amber], markMax: 11 })).rejects.toThrow(/1 to 10/);
    await expect(saveSpecial({ danceType: "Trio", memberCoupleIds: [amber], panelJudgeIds: [judges[0]] })).rejects.toThrow(/2 to 4 judges/);
    await expect(saveSpecial({ danceType: "Trio", memberCoupleIds: [amber], panelJudgeIds: [judges[0], amber] })).rejects.toThrow(/must be a judge/);
    await expect(saveSpecial({ danceType: "Trio", memberCoupleIds: [amber], songs: [1, 2, 3, 4, 5].map((n) => ({ title: `S${n}` })) })).rejects.toThrow(/up to 4 songs/);
    await expect(saveSpecial({ danceType: "Trio", memberCoupleIds: [amber], details: [{ label: " ", value: "x" }] })).rejects.toThrow(/needs a label/);
    await expect(saveSpecial({ danceType: "Trio", memberCoupleIds: [amber], scoringMode: "stars" })).rejects.toThrow(/marks or points/);
    await expect(saveSpecial({ danceType: "Trio", memberCoupleIds: [amber] }, friend)).rejects.toThrow(/Only a site admin/);
    // Removal: admin only, and never while posted.
    await expect(db.query("select public.delete_special_dance($1, $2, $3)", [episode, second, friend])).rejects.toThrow(/Only a site admin/);
    await db.query("select public.delete_special_dance($1, $2, $3)", [episode, second, admin]);
    expect((await db.query("select id from public.episode_teams")).rows).toHaveLength(2);
  });

  it("scores marks on the night's panel in whole numbers, posting max_score with every row", async () => {
    const duel = await saveSpecial({ danceType: "Challenge", name: "Cha-Cha Challenge", memberCoupleIds: [amber, julia] });
    await ownDances([amber, julia]);
    await revealCouple(amber);
    await revealCouple(julia);
    // The table itself refuses a half mark, not only the app.
    await expect(saveMarks(duel, [8.5, 9, 9, 9])).rejects.toThrow(/episode_team_marks_whole_mark/);
    await expect(saveMarks(duel, [9, 9], [judges[0], amber])).rejects.toThrow(/this dance's judges/);
    await saveMarks(duel, [10], [judges[0]]);
    await expect(revealTeam(duel)).rejects.toThrow(/Cha-Cha Challenge has 1 of 4 marks/);
    await saveMarks(duel, [10, 9, 9, 9]);
    await revealTeam(duel);
    // 37 of 40 scaled to 30 is 27.75; the live row records max_score 40 and all four judges' marks.
    expect((await liveRows(amber)).filter((r) => r.team_id === duel)).toMatchObject([{ total: 37, scaled: 27.75, max: 40, judges: 4 }]);
    // Amber's night: 33/40 own + 37/40 challenge = 70/80 -> 26.25, the same for Julia.
    expect(await rosterPoints(admin)).toBe(26.25);
    expect(await rosterPoints(friend)).toBe(26.25);
    // Scoring is locked while marks are saved, and participants while posted.
    await expect(saveSpecial({ id: duel, scoringMode: "points" })).rejects.toThrow(/Un-post Cha-Cha Challenge before changing how it is scored/);
    await expect(saveSpecial({ id: duel, memberCoupleIds: [amber] })).rejects.toThrow(/before changing its participants/);
    // Display fields stay editable and the live rows follow the style and song.
    await saveSpecial({ id: duel, danceStyleId: contemporary, songs: [{ title: "Sway" }] });
    expect((await db.query<{ style: string; song: string }>("select distinct dance_style_id as style, song_title as song from public.dance_scores where team_id = $1", [duel])).rows)
      .toEqual([{ style: contemporary, song: "Sway" }]);
    await revealTeam(duel, true);
    await expect(saveSpecial({ id: duel, scoringMode: "points" })).rejects.toThrow(/Clear the saved scores of Cha-Cha Challenge/);
    await saveMarks(duel, []);
    await saveSpecial({ id: duel, scoringMode: "points" });
    await saveSpecial({ id: duel, scoringMode: "marks" });
    expect(await team(duel)).toMatchObject({ mark_max: 10, panel_judge_ids: null });
    // A panel outside 2 to 4 blocks marks by name.
    await db.exec(`delete from public.episode_guest_judges where episode_id = '${episode}'; update public.people set archived_at = now() where id in ('${judges[1]}', '${judges[2]}')`);
    await expect(saveMarks(duel, [9], [judges[0]])).rejects.toThrow(/needs 2 to 4 judges and this night has 1/);
  });

  it("scores a dance-off in points, posts, undoes, re-posts and finishes the week with bonus points above 30", async () => {
    const team1 = await saveSpecial({ danceType: "Team Dance", name: "Slaytopia", memberCoupleIds: [tatyana, amber, julia], songs: [{ title: "Zoo" }] });
    const danceOff = await saveSpecial({ danceType: "Dance-Off", name: "", memberCoupleIds: [amber, julia], scoringMode: "points" });
    await ownDances([tatyana, amber, julia]);
    for (const couple of [tatyana, amber, julia]) await revealCouple(couple);
    await expect(saveMarks(danceOff, [9, 9, 9, 9])).rejects.toThrow(/scored in points, not judges' marks/);
    await expect(savePoints(team1, [{ coupleId: amber, points: 3 }])).rejects.toThrow(/scored by judges' marks, not points/);
    await expect(savePoints(danceOff, [{ coupleId: connor, points: 3 }])).rejects.toThrow(/this dance's participants/);
    await expect(savePoints(danceOff, [{ coupleId: amber, points: 3.25 }])).rejects.toThrow(/steps of 0.5/);
    await expect(savePoints(danceOff, [{ coupleId: amber, points: 101 }])).rejects.toThrow(/between -100 and 100/);
    await expect(savePoints(danceOff, [{ coupleId: amber, points: 3, result: "x".repeat(41) }])).rejects.toThrow(/40 characters/);
    await expect(savePoints(danceOff, [{ coupleId: amber, points: 3 }], outsider)).rejects.toThrow(/Not authorized/);
    await savePoints(danceOff, [{ coupleId: amber, points: 3, result: "Winner" }, { coupleId: julia, points: null, result: "Loser" }]);
    await expect(revealTeam(danceOff)).rejects.toThrow(/Dance-Off has points for 1 of 2 couples/);
    await saveMarks(team1, [9, 9, 9, 9]);
    const data = await snapshot();
    expect(data.teamScores).toHaveLength(2);
    expect(() => buildPublicationPlan(data, episode)).toThrow(/Dance-Off has points for 1 of 2 couples/);
    await savePoints(danceOff, [{ coupleId: julia, points: 0, result: "Loser" }]);
    await revealTeam(danceOff);
    // A Points row: total = points, scaled 0, max 0, no judge marks; a 0 is an explicit row.
    expect((await liveRows(amber)).filter((r) => r.team_id === danceOff)).toMatchObject([{ total: 3, scaled: 0, max: 0, judges: 0 }]);
    expect((await liveRows(julia)).filter((r) => r.team_id === danceOff)).toMatchObject([{ total: 0, scaled: 0, max: 0, judges: 0 }]);
    // Amber: 33/40 own + 3 bonus = 36/40 -> 27. Julia: 33/40 + 0 -> 24.75.
    expect(await rosterPoints(admin)).toBe(27);
    expect(await rosterPoints(friend)).toBe(24.75);
    // Points lock the scoring mode until cleared; the result alone does not.
    await expect(saveSpecial({ id: danceOff, scoringMode: "marks" })).rejects.toThrow(/Un-post Dance-Off before changing how it is scored/);
    await revealTeam(danceOff, true);
    expect((await liveRows(amber)).map((r) => r.team_id)).toEqual([null]);
    expect(await rosterPoints(admin)).toBe(24.75);
    await expect(saveSpecial({ id: danceOff, scoringMode: "marks" })).rejects.toThrow(/Clear the saved scores of Dance-Off/);
    // Re-post with a penalty for Julia, then the team, then Finish Week materializes both.
    await savePoints(danceOff, [{ coupleId: julia, points: -1.5, result: "Loser" }]);
    await revealTeam(danceOff);
    expect((await liveRows(julia)).filter((r) => r.team_id === danceOff)).toMatchObject([{ total: -1.5, max: 0 }]);
    await finishWeek();
    // Amber: 33 own + 36 team + 3 bonus = 72 over 80 marks -> 27. Julia: 33 + 36 - 1.5 = 67.5/80 -> 25.31.
    // liveRows orders tagged rows by team_id; those UUIDs are assigned at
    // insert, so Slaytopia vs Dance-Off order is not stable. The three
    // [total, max] pairs are the assertion.
    expect(
      (await liveRows(amber))
        .map((r) => [r.total, r.max] as [number, number | null])
        .sort((a, b) => (a[1] ?? -1) - (b[1] ?? -1) || a[0] - b[0])
    ).toEqual([[33, null], [3, 0], [36, 40]]);
    expect(await rosterPoints(admin)).toBe(27);
    expect(await rosterPoints(friend)).toBe(25.31);
    expect(await postedAt(team1)).not.toBeNull();
    // Special dances are never couples: none of their ids reaches the couple tables, and every tagged row belongs to a participant.
    const leaks = await db.query<{ n: number }>(
      `select (select count(*) from public.couples c where c.id in (select id from public.episode_teams))
            + (select count(*) from public.roster_slots r where r.couple_id in (select id from public.episode_teams))
            + (select count(*) from public.episode_results e where e.couple_id in (select id from public.episode_teams))
            + (select count(*) from public.dance_scores d where d.team_id is not null
                 and not exists (select 1 from public.episode_team_members m where m.team_id = d.team_id and m.couple_id = d.couple_id)) as n`);
    expect(Number(leaks.rows[0].n)).toBe(0);
    expect((await db.query<{ n: number }>("select count(*)::int n from public.episode_results where episode_id = $1", [episode])).rows[0].n).toBe(3);
  });

  it("refuses an unversioned plan only while the episode has a Points-mode dance", async () => {
    const team1 = await saveSpecial({ danceType: "Team Dance", name: "Slaytopia", memberCoupleIds: [amber, julia] });
    await ownDances([amber, julia]);
    await revealCouple(amber);
    await saveMarks(team1, [9, 9, 9, 9]);
    const unversioned = (plan: object) => JSON.stringify({ ...plan, planVersion: undefined });
    let data = await snapshot();
    // Older code's plan still posts an ordinary team night.
    await db.query("select public.commit_team_reveal($1, $2, $3, $4, $5, false)", [episode, team1, admin, JSON.stringify(data), unversioned(buildTeamRevealPlan(data, episode, team1, false))]);
    expect(await postedAt(team1)).not.toBeNull();
    await saveSpecial({ danceType: "Dance-Off", name: "", memberCoupleIds: [amber], scoringMode: "points" });
    data = await snapshot();
    const refused = /scored in points, which this version of the app cannot score/;
    await expect(db.query("select public.commit_team_reveal($1, $2, $3, $4, $5, true)", [episode, team1, admin, JSON.stringify(data), unversioned(buildTeamRevealPlan(data, episode, team1, true))])).rejects.toThrow(refused);
    await expect(db.query("select public.commit_episode_reveal($1, $2, $3, $4, $5, false)", [episode, julia, admin, JSON.stringify(data), unversioned(buildRevealPlan(data, episode, julia, false))])).rejects.toThrow(refused);
    await expect(db.query("select public.commit_episode_publication($1, $2, $3, $4)", [episode, admin, JSON.stringify(data), unversioned({ coupleUpdates: [], futureEpisodeIds: [], weeklyScores: [] })])).rejects.toThrow(refused);
    // The current plan goes through, and a points edit between planning and committing fails the revision.
    await revealTeam(team1, true);
    const danceOff = (await db.query<{ id: string }>("select id from public.episode_teams where scoring_mode = 'points'")).rows[0].id;
    await savePoints(danceOff, [{ coupleId: amber, points: 2 }]);
    const stale = await snapshot();
    await savePoints(danceOff, [{ coupleId: amber, points: 4 }]);
    await expect(revealTeam(danceOff, false, stale)).rejects.toThrow(/inputs changed/);
    await revealTeam(danceOff);
    expect((await liveRows(amber)).map((r) => r.total)).toEqual([33, 4]);
  });

  it("releases a couple's own draft after its special dance posts, and still refuses one whose own dance is live", async () => {
    await db.exec(readFileSync("supabase/apply-draft-release-own-rows.sql", "utf8"));
    const danceOff = await saveSpecial({ danceType: "Dance-Off", memberCoupleIds: [amber, julia], scoringMode: "points" });
    await savePoints(danceOff, [{ coupleId: amber, points: 3 }, { coupleId: julia, points: 0 }]);
    await revealTeam(danceOff);
    await ownDances([amber, julia]);
    const release = (coupleId: string) =>
      db.query("select public.set_draft_couple_release($1, $2, $3, true)", [episode, coupleId, friend]);
    await release(amber);
    expect((await db.query("select couple_id from public.draft_couple_releases where episode_id = $1", [episode])).rows).toEqual([{ couple_id: amber }]);
    await revealCouple(julia);
    await expect(release(julia)).rejects.toThrow(/already live/);
  });

  it("keeps points and results out of every API role's reach until posted", async () => {
    const danceOff = await saveSpecial({ danceType: "Dance-Off", memberCoupleIds: [amber, julia], scoringMode: "points" });
    await savePoints(danceOff, [{ coupleId: amber, points: 3, result: "Winner" }]);
    const memberColumns = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'episode_team_members'")).rows.map((r) => r.column_name);
    expect(memberColumns).toEqual(expect.arrayContaining(["team_id", "episode_id", "couple_id", "sort_order"]));
    expect(memberColumns).not.toEqual(expect.arrayContaining(["points"]));
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await expect(db.query("select * from public.episode_team_scores")).rejects.toThrow(/permission denied/i);
        await expect(db.query("select * from public._backup_20261103_episode_team_marks")).rejects.toThrow(/permission denied/i);
        await expect(db.query("select public.save_special_dance($1, $2, '{}'::jsonb)", [episode, admin])).rejects.toThrow(/permission denied/i);
        await expect(db.query("select public.save_special_dance_points($1, $2, $3, '[]'::jsonb)", [episode, danceOff, admin])).rejects.toThrow(/permission denied/i);
        await expect(db.query("select public.delete_special_dance($1, $2, $3)", [episode, danceOff, admin])).rejects.toThrow(/permission denied/i);
        await expect(db.query("select public.special_dance_panel($1)", [danceOff])).rejects.toThrow(/permission denied/i);
        // The dance itself (name, type, members) stays readable, as team names are today.
        if (role === "authenticated") expect((await db.query("select dance_type, scoring_mode from public.episode_teams")).rows).toEqual([{ dance_type: "Dance-Off", scoring_mode: "points" }]);
      } finally {
        await db.exec("reset role");
      }
    }
  });
});

describe("special dance draft release in PostgreSQL", () => {
  type VisibleRow = { team_id: string; couple_id: string; dance_style_name: string; total: number; scaled: number; max: number; week_number: number };
  const releaseSql = readFileSync("supabase/apply-special-draft-release.sql", "utf8");
  const viewer = outsider;

  beforeAll(async () => {
    db = await freshDb(true);
    await db.exec(releaseSql);
    await db.exec(releaseSql);
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  beforeEach(async () => {
    await seedSeason();
    await unlockDrafts(8);
  });

  async function unlockDrafts(weekNumber: number) {
    await db.query(
      `insert into public.spoiler_watch_progress(user_id, season_id, last_watched_week, draft_unlocked_week) values ($1, $2, $3, $3)
       on conflict (user_id, season_id) do update set last_watched_week = excluded.last_watched_week, draft_unlocked_week = excluded.draft_unlocked_week`,
      [viewer, season, weekNumber]
    );
  }
  async function asViewer<T>(sql: string): Promise<T[]> {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [viewer]);
    await db.exec("set role authenticated");
    try {
      return (await db.query<T>(sql)).rows;
    } finally {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub', '', false)");
    }
  }
  async function visible(): Promise<VisibleRow[]> {
    return asViewer<VisibleRow>(
      `select team_id, couple_id, dance_style_name, total_score::float as total, scaled_score::float as scaled, max_score::float as max, week_number
       from public.visible_draft_special_scores() order by couple_id`
    );
  }
  async function release(teamId: string, on = true, actor = friend) {
    await db.query("select public.set_special_draft_release($1, $2, $3, $4)", [episode, teamId, actor, on]);
  }
  async function liveTeamRows(teamId: string) {
    return (await db.query<{ couple_id: string; total: number; scaled: number; max: number }>(
      "select couple_id, total_score::float as total, scaled_score::float as scaled, max_score::float as max from public.dance_scores where team_id = $1 order by couple_id",
      [teamId]
    )).rows;
  }

  it("shows a released marks dance exactly as posting writes it, then hands over to the posted rows", async () => {
    const relay = await saveSpecial({ danceType: "Relay", name: "Relay", memberCoupleIds: [amber, julia, connor], danceStyleId: contemporary });
    await saveMarks(relay, [9, 8, 9]);
    await expect(release(relay)).rejects.toThrow(/Relay has 3 of 4 marks/);
    await saveMarks(relay, [9, 8, 9, 10]);
    await release(relay);
    const drafted = await visible();
    expect(drafted).toEqual([amber, julia, connor].sort().map((couple_id) => ({
      team_id: relay, couple_id, dance_style_name: "Contemporary", total: 36, scaled: 27, max: 40, week_number: 8,
    })));
    await revealTeam(relay);
    expect(await visible()).toEqual([]);
    expect(await liveTeamRows(relay)).toEqual(drafted.map(({ couple_id, total, scaled, max }) => ({ couple_id, total, scaled, max })));
    await expect(release(relay)).rejects.toThrow(/Relay is already posted/);
  });

  it("releases a points dance without its result text, only once every participant has points", async () => {
    const danceOff = await saveSpecial({ danceType: "Dance-Off", memberCoupleIds: [amber, julia], scoringMode: "points" });
    await savePoints(danceOff, [{ coupleId: amber, points: 3, result: "Winner" }]);
    await expect(release(danceOff)).rejects.toThrow(/Dance-Off has points for 1 of 2 couples/);
    await savePoints(danceOff, [{ coupleId: amber, points: 3, result: "Winner" }, { coupleId: julia, points: 0, result: "Loser" }]);
    await release(danceOff);
    const rows = await asViewer<Record<string, unknown>>("select * from public.visible_draft_special_scores() order by couple_id");
    expect(rows.map((r) => [r.couple_id, Number(r.total_score), Number(r.scaled_score), Number(r.max_score)])).toEqual([[amber, 3, 0, 0], [julia, 0, 0, 0]]);
    expect(JSON.stringify(rows)).not.toMatch(/Winner|Loser/);
  });

  it("shows a release only to a viewer who unlocked that week, while the dance stays fully scored", async () => {
    const relay = await saveSpecial({ danceType: "Relay", name: "Relay", memberCoupleIds: [amber, julia] });
    await saveMarks(relay, [9, 9, 9, 9]);
    await release(relay);
    expect(await asViewer("select team_id from public.draft_special_releases")).toEqual([{ team_id: relay }]);
    await unlockDrafts(7);
    expect(await visible()).toEqual([]);
    await unlockDrafts(8);
    expect(await visible()).toHaveLength(2);
    await saveMarks(relay, [9, 9, 9]);
    expect(await visible()).toEqual([]);
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.visible_draft_special_scores()")).rejects.toThrow(/permission denied/i);
      await expect(db.query("select * from public.draft_special_releases")).rejects.toThrow(/permission denied/i);
    } finally {
      await db.exec("reset role");
    }
    await db.exec("set role authenticated");
    try {
      await expect(db.query("select public.set_special_draft_release($1, $2, $3, true)", [episode, relay, friend])).rejects.toThrow(/permission denied/i);
    } finally {
      await db.exec("reset role");
    }
  });

  it("refuses a non-contributor, withdraws, and drops the release with the dance or the published week", async () => {
    const relay = await saveSpecial({ danceType: "Relay", name: "Relay", memberCoupleIds: [amber, julia] });
    await saveMarks(relay, [9, 9, 9, 9]);
    await expect(release(relay, true, outsider)).rejects.toThrow(/Not authorized/);
    await release(relay);
    await release(relay, false);
    expect(await visible()).toEqual([]);
    await release(relay);
    await db.query("select public.delete_special_dance($1, $2, $3)", [episode, relay, admin]);
    expect((await db.query("select * from public.draft_special_releases")).rows).toEqual([]);

    const trio = await saveSpecial({ danceType: "Trio", name: "Trio", memberCoupleIds: [amber, julia] });
    await saveMarks(trio, [8, 8, 8, 8]);
    await release(trio);
    await ownDances([tatyana, maura, amber, julia, connor, ezra]);
    for (const couple of [tatyana, maura, amber, julia, connor, ezra]) await revealCouple(couple);
    await finishWeek();
    expect(await visible()).toEqual([]);
    await expect(release(trio)).rejects.toThrow(/Only a site admin can correct published results/);
  });
});
