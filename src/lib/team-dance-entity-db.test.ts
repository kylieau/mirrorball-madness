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
let freestyle: string;

type TeamInput = {
  id?: string | null; name: string; songTitle?: string | null; songSource?: string | null;
  danceStyleId?: string | null; captainCoupleId?: string | null; hostName?: string | null; memberCoupleIds: string[];
};
const slaytopia = (overrides: Partial<TeamInput> = {}): TeamInput => ({
  name: "Slaytopia", songTitle: "Zoo", songSource: "Zootopia 2", captainCoupleId: tatyana, hostName: "Alfonso Ribeiro",
  memberCoupleIds: [tatyana, maura, amber, julia], ...overrides,
});
const wildcats = (overrides: Partial<TeamInput> = {}): TeamInput => ({
  name: "Wildcats", songTitle: "We're All in This Together", captainCoupleId: connor, memberCoupleIds: [connor, ezra, whitney], ...overrides,
});
const marks = (scores: number[], judgeIds = [...judges, guest]) => scores.map((score, i) => ({ judgeId: judgeIds[i], score }));

async function saveTeams(teams: TeamInput[], actor = admin): Promise<{ teamIds: string[] }> {
  return (await db.query<{ data: { teamIds: string[] } }>("select public.save_episode_teams($1, $2, $3) as data", [episode, actor, JSON.stringify(teams)])).rows[0].data;
}
async function saveMarks(teamId: string, scores: number[], actor = friend) {
  await db.query("select public.save_team_marks($1, $2, $3, $4)", [episode, teamId, actor, JSON.stringify(marks(scores))]);
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
  return (await db.query<{ style: string; total: number; team_id: string | null; judges: number }>(
    `select d.dance_style_id as style, d.total_score::float as total, d.team_id,
       (select count(*) from public.judge_scores j where j.dance_score_id = d.id)::int as judges
     from public.dance_scores d where d.episode_id = $1 and d.couple_id = $2 order by d.team_id nulls first`, [episode, coupleId])).rows;
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

describe("team dances as their own entity in PostgreSQL", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; grant usage on schema auth to anon, authenticated, service_role;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;`);
    const schema = readFileSync("supabase/schema.sql", "utf8")
      .replace('create extension if not exists "pgcrypto";', "")
      .replace(/alter publication supabase_realtime add table [^;]+;/g, "");
    await db.exec(schema);
    const migration = readFileSync("supabase/apply-team-dance-entity.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration); // Dashboard reruns must be safe.
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  beforeEach(async () => {
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
    freestyle = (await db.query<{ id: string }>("select id from public.dance_styles where lower(name) = 'freestyle'")).rows[0].id;
  });

  it("saves teams only when every invariant holds, and protects a posted team", async () => {
    await expect(saveTeams([slaytopia({ captainCoupleId: connor })])).rejects.toThrow(/captain .* must be on the team/);
    await expect(saveTeams([slaytopia({ memberCoupleIds: [tatyana] })])).rejects.toThrow(/at least two couples/);
    await expect(saveTeams([slaytopia(), wildcats({ memberCoupleIds: [connor, amber] })])).rejects.toThrow(/only one team/);
    await expect(saveTeams([slaytopia({ memberCoupleIds: [tatyana, id(99)] })])).rejects.toThrow(/not in this season/);
    await expect(saveTeams([slaytopia()], friend)).rejects.toThrow(/Only a site admin/);
    const [team, cats] = (await saveTeams([slaytopia(), wildcats()])).teamIds;
    expect((await db.query("select * from public.episode_team_members where team_id = $1", [team])).rows).toHaveLength(4);
    await ownDances([tatyana, maura, amber, julia]);
    await saveMarks(team, [9, 9, 9, 9]);
    await revealTeam(team);
    // Against #6: a posted team cannot be removed or have its members changed.
    await expect(saveTeams([{ ...wildcats(), id: cats }])).rejects.toThrow(/Un-post team "Slaytopia" before removing it/);
    await expect(saveTeams([{ ...slaytopia({ memberCoupleIds: [tatyana, maura, amber] }), id: team }, { ...wildcats(), id: cats }])).rejects.toThrow(/before changing its members/);
    await expect(db.query("delete from public.episode_teams where id = $1", [team])).rejects.toThrow(/foreign key|violates/);
    // A renamed song follows the live rows.
    await saveTeams([{ ...slaytopia({ songTitle: "Try Everything" }), id: team }, { ...wildcats(), id: cats }]);
    expect((await db.query<{ song_title: string }>("select distinct song_title from public.dance_scores where team_id = $1", [team])).rows).toEqual([{ song_title: "Try Everything" }]);
  });

  it("keeps partial marks, posts only with four, and writes one tagged row per eligible member", async () => {
    const [team, cats] = (await saveTeams([slaytopia(), wildcats()])).teamIds;
    await ownDances([tatyana, amber, julia, connor, ezra]);
    await checkedSave([entry(maura, [], "bye")]);
    await db.query("select public.save_team_marks($1, $2, $3, $4)", [episode, team, friend, JSON.stringify(marks([9, 9, 9], judges))]);
    expect((await db.query("select * from public.episode_team_marks where team_id = $1", [team])).rows).toHaveLength(3);
    await expect(revealTeam(team)).rejects.toThrow(/Team Dance · Slaytopia has 3 of four marks/);
    await expect(db.query("select public.save_team_marks($1, $2, $3, $4)", [episode, team, friend, JSON.stringify(marks([9, 9, 11, 9]))])).rejects.toThrow(/between 0 and 10/);
    await expect(db.query("select public.save_team_marks($1, $2, $3, $4)", [episode, team, outsider, JSON.stringify(marks([9, 9, 9, 9]))])).rejects.toThrow(/Not authorized/);
    await saveMarks(team, [9, 9, 9, 9]);
    await expect(db.query("select public.commit_team_reveal($1, $2, $3, $4, $5, false)", [episode, team, friend, "{}", "{}"])).rejects.toThrow(/Not authorized/);
    await revealTeam(team);
    for (const couple of [tatyana, amber, julia]) {
      const rows = await liveRows(couple);
      expect(rows.filter((r) => r.team_id === team)).toMatchObject([{ style: freestyle, total: 36, judges: 4 }]);
    }
    expect(await liveRows(maura)).toEqual([]); // Did Not Dance: skipped.
    expect(await postedAt(team)).not.toBeNull();
    await saveMarks(cats, [8, 8, 8, 8]);
    await revealTeam(cats);
    expect(await liveRows(whitney)).toEqual([]); // Withdrawn: skipped.
    expect((await liveRows(connor)).filter((r) => r.team_id === cats)).toHaveLength(1);
    // A four-judge panel is required.
    await db.exec(`delete from public.episode_guest_judges where episode_id = '${episode}'`);
    await expect(saveMarks(cats, [8, 8, 8, 8])).rejects.toThrow(/exactly four judges and this night has 3/);
  });

  it("posts a couple's own dance and the team separately, in either order, and recomputes Dance Card each time", async () => {
    const [team] = (await saveTeams([slaytopia({ memberCoupleIds: [amber, julia], captainCoupleId: amber })])).teamIds;
    await ownDances([amber, julia]);
    await revealCouple(amber); // Own dance first: 33/40 pays its one-dance basis.
    expect(await rosterPoints(admin)).toBe(24.75);
    await saveMarks(team, [9, 9, 9, 9]);
    await revealTeam(team); // Team later: Amber's night is now 33 + 36 over 80.
    expect((await liveRows(amber)).map((r) => [r.total, r.team_id])).toEqual([[33, null], [36, team]]);
    expect(await rosterPoints(admin)).toBe(25.88);
    expect(await rosterPoints(friend)).toBe(27); // Julia: team only so far, 36/40 on the 30 basis.
    await revealCouple(julia); // Own dance after the team.
    expect((await liveRows(julia)).map((r) => r.team_id)).toEqual([null, team]);
    expect(await rosterPoints(friend)).toBe(25.88);
    // Against #2: un-posting a couple leaves the team's row; un-posting the team leaves the couple's own row.
    await revealCouple(amber, true);
    expect((await liveRows(amber)).map((r) => r.team_id)).toEqual([team]);
    expect(await rosterPoints(admin)).toBe(27);
    await revealCouple(amber);
    await revealTeam(team, true);
    expect((await liveRows(amber)).map((r) => r.team_id)).toEqual([null]);
    expect(await postedAt(team)).toBeNull();
    expect(await rosterPoints(admin)).toBe(24.75);
    // Re-post with new marks rewrites the team rows in place.
    await revealTeam(team);
    await saveMarks(team, [10, 10, 10, 10]);
    await revealTeam(team);
    expect((await liveRows(amber)).filter((r) => r.team_id === team)).toMatchObject([{ total: 40, judges: 4 }]);
    expect((await db.query("select count(*)::int as n from public.dance_scores where team_id = $1", [team])).rows[0]).toEqual({ n: 2 });
  });

  it("never treats a couple with only a team row as posted, so their own draft still publishes", async () => {
    // Against #3.
    const [team] = (await saveTeams([slaytopia({ memberCoupleIds: [amber, julia], captainCoupleId: amber })])).teamIds;
    await ownDances([amber, julia]);
    await saveMarks(team, [9, 9, 9, 9]);
    await revealTeam(team); // Only team rows are live; nobody's own dance is posted.
    // The checked save still writes Amber's own dances (she is not "posted").
    expect(await checkedSave([entry(amber, [{ style: contemporary, song: "Song 0", scores: [9, 9, 9, 9] }])])).toEqual({ acknowledged: [amber], skippedPosted: [] });
    // Her own dance can still be posted (the team row is not "already posted").
    await revealCouple(julia);
    expect((await liveRows(julia)).map((r) => r.team_id)).toEqual([null, team]);
    await revealCouple(julia, true);
    // Finish Week with team-only live rows: every couple's own draft publishes, the team rows stay.
    await finishWeek();
    expect((await liveRows(amber)).map((r) => [r.total, r.team_id])).toEqual([[36, null], [36, team]]);
    expect((await liveRows(julia)).map((r) => [r.total, r.team_id])).toEqual([[33, null], [36, team]]);
    expect(await rosterPoints(admin)).toBe(27); // 72/80 → 27.
    expect(await rosterPoints(friend)).toBe(25.88);
  });

  it("refuses to finish the week with a half-scored team, then materializes every team from its marks", async () => {
    // Against #1.
    const [team, cats] = (await saveTeams([slaytopia({ memberCoupleIds: [amber, julia], captainCoupleId: amber }), wildcats({ memberCoupleIds: [connor, ezra] })])).teamIds;
    await ownDances([amber, julia, connor, ezra]);
    await saveMarks(team, [9, 9, 9, 9]);
    await revealTeam(team);
    for (const c of [amber, julia, connor, ezra]) await revealCouple(c);
    await db.query("select public.save_team_marks($1, $2, $3, $4)", [episode, cats, friend, JSON.stringify(marks([8, 8, 8], judges))]);
    let data = await snapshot();
    expect(() => buildPublicationPlan(data, episode)).toThrow(/Team Dance · Wildcats has 3 of four marks/);
    const blind = { ...data, teamMarks: [...(data.teamMarks ?? []), { team_id: cats, judge_id: guest, score: 8, updated_at: "", updated_by: null }] } as PublicationSnapshot;
    await expect(
      db.query("select public.commit_episode_publication($1, $2, $3, $4)", [episode, admin, JSON.stringify(data), JSON.stringify(buildPublicationPlan(blind, episode))])
    ).rejects.toThrow(/Team Wildcats has 3 of four marks/);
    await saveMarks(cats, [8, 8, 8, 8]); // Never posted: Finish Week materializes it.
    await finishWeek();
    data = await snapshot();
    expect(data.episodes[0].results_published_at).not.toBeNull();
    expect((await liveRows(connor)).map((r) => [r.total, r.team_id])).toEqual([[33, null], [32, cats]]);
    expect((await db.query("select count(*)::int as n from public.dance_scores where team_id = $1", [team])).rows[0]).toEqual({ n: 2 }); // No duplicates for the posted team.
    expect(await postedAt(cats)).not.toBeNull();
    expect(await rosterPoints(admin)).toBe(25.88);
  });

  it("corrects a published team through its marks without duplicating rows", async () => {
    // Against #4 and #5.
    const [team] = (await saveTeams([slaytopia({ memberCoupleIds: [amber, julia], captainCoupleId: amber })])).teamIds;
    await ownDances([amber, julia]);
    await saveMarks(team, [9, 9, 9, 9]);
    await finishWeek();
    await expect(saveMarks(team, [10, 10, 10, 10], admin)).rejects.toThrow(/begin a correction/);
    const token = (await db.query<{ token: string }>("select public.seed_episode_correction($1, $2) as token", [episode, admin])).rows[0].token;
    // The correction draft holds only the couples' own dances.
    expect((await db.query("select count(*)::int as n from public.draft_dance_scores where episode_id = $1", [episode])).rows[0]).toEqual({ n: 2 });
    await saveMarks(team, [10, 10, 10, 10], admin);
    // Against #5: a marks edit between planning and committing is refused by the revision.
    const stale = await snapshot();
    await saveMarks(team, [10, 10, 10, 9], admin);
    await expect(
      db.query("select public.commit_episode_publication($1, $2, $3, $4)", [episode, admin, JSON.stringify(stale), JSON.stringify(buildPublicationPlan(stale, episode))])
    ).rejects.toThrow(/inputs changed/);
    await checkedSave([entry(amber, [{ style: contemporary, song: "Song 0", scores: [9, 9, 9, 9] }])], admin, token);
    await finishWeek();
    expect((await liveRows(amber)).map((r) => [r.total, r.team_id])).toEqual([[36, null], [39, team]]);
    expect((await db.query("select count(*)::int as n from public.dance_scores where episode_id = $1", [episode])).rows[0]).toEqual({ n: 4 });
  });

  it("re-evaluates eligibility on re-post and at Finish Week", async () => {
    // Against #7.
    const [team] = (await saveTeams([slaytopia({ memberCoupleIds: [amber, julia], captainCoupleId: amber })])).teamIds;
    await ownDances([amber, julia]);
    await saveMarks(team, [9, 9, 9, 9]);
    await revealTeam(team);
    expect((await liveRows(julia)).map((r) => r.team_id)).toEqual([team]);
    await checkedSave([entry(julia, [], "bye")]); // Marked Did Not Dance after the team posted.
    expect((await liveRows(julia)).map((r) => r.team_id)).toEqual([team]); // Kept until the team is touched again.
    await revealTeam(team);
    expect(await liveRows(julia)).toEqual([]);
    await revealCouple(amber);
    await finishWeek();
    expect(await liveRows(julia)).toEqual([]);
    expect((await liveRows(amber)).map((r) => r.team_id)).toEqual([null, team]);
  });

  it("still refuses to finish the week when a posted couple's own draft diverges", async () => {
    await ownDances([amber]);
    await revealCouple(amber);
    await db.exec(`update public.draft_judge_scores set score = 10 where draft_dance_score_id in (select id from public.draft_dance_scores where couple_id = '${amber}')`);
    const data = await snapshot();
    expect(() => buildPublicationPlan(data, episode)).toThrow(/differ from their draft/);
  });

  it("denies the RPCs, the marks table and writes to anonymous and ordinary signed-in clients", async () => {
    const [team] = (await saveTeams([slaytopia()])).teamIds;
    await saveMarks(team, [9, 9, 9, 9]);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await expect(db.query("select public.save_team_marks($1, $2, $3, '[]'::jsonb)", [episode, team, admin])).rejects.toThrow(/permission denied/i);
        await expect(db.query("select public.commit_team_reveal($1, $2, $3, '{}'::jsonb, '{}'::jsonb, false)", [episode, team, admin])).rejects.toThrow(/permission denied/i);
        await expect(db.query("select public.materialize_team_scores($1, $2)", [episode, team])).rejects.toThrow(/permission denied/i);
        await expect(db.query("select * from public.episode_team_marks")).rejects.toThrow(/permission denied/i);
        await expect(db.query("update public.dance_scores set team_id = null")).rejects.toThrow(/permission denied/i);
        if (role === "anon") expect((await db.query("select * from public.episode_teams")).rows).toHaveLength(0); // Unpublished: hidden from guests.
        else expect((await db.query("select * from public.episode_teams")).rows).toHaveLength(1);
      } finally {
        await db.exec("reset role");
      }
    }
  });
});
