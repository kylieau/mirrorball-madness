import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildRevealPlan } from "./episode-reveal";
import { buildPublicationPlan, type PublicationSnapshot } from "./episode-publication";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1), friend = id(2), outsider = id(3);
const season = id(4), week = id(5), episode = id(6), league = id(7), contemporary = id(8);
const judges = [id(20), id(21), id(22)], guest = id(23), extraGuest = id(24);
// Tatyana, Maura, Amber, Julia (Slaytopia); Connor, Ezra (Wildcats); Whitney withdrew.
const cast = [id(30), id(31), id(32), id(33), id(34), id(35), id(36)];
const [tatyana, maura, amber, julia, connor, ezra, whitney] = cast;
let db: PGlite;
let freestyle: string;

type TeamInput = {
  id?: string | null; name: string; songTitle?: string | null; songSource?: string | null;
  danceStyleId?: string | null; captainCoupleId?: string | null; hostName?: string | null; memberCoupleIds: string[];
};
type TeamsResult = { teamIds: string[]; posted: string[]; collisions: { coupleId: string }[] };
type ApplyResult = { applied: string[]; posted: string[]; skipped: { coupleId: string; reason: string }[]; collisions: { coupleId: string; teamRows: number; otherDances: number }[] };

const slaytopia = (overrides: Partial<TeamInput> = {}): TeamInput => ({
  name: "Slaytopia", songTitle: "Zoo", songSource: "Zootopia 2", captainCoupleId: tatyana, hostName: "Alfonso Ribeiro",
  memberCoupleIds: [tatyana, maura, amber, julia], ...overrides,
});
const wildcats = (overrides: Partial<TeamInput> = {}): TeamInput => ({
  name: "Wildcats", songTitle: "We're All in This Together", captainCoupleId: connor, memberCoupleIds: [connor, ezra, whitney], ...overrides,
});
const marks = (scores: number[], judgeIds = [...judges, guest]) => judgeIds.map((judgeId, i) => ({ judgeId, score: scores[i] }));

async function saveTeams(teams: TeamInput[], actor = admin): Promise<TeamsResult> {
  const result = await db.query<{ data: TeamsResult }>("select public.save_episode_teams($1, $2, $3) as data", [episode, actor, JSON.stringify(teams)]);
  return result.rows[0].data;
}
async function apply(teamId: string, scores: number[], actor = friend, coupleIds: string[] | null = null): Promise<ApplyResult> {
  const result = await db.query<{ data: ApplyResult }>("select public.apply_team_dance($1, $2, $3, $4, $5) as data", [episode, actor, teamId, JSON.stringify(marks(scores)), coupleIds]);
  return result.rows[0].data;
}
function entry(coupleId: string, dances: { style: string; song: string; scores: number[] }[], outcome = "safe") {
  return { coupleId, outcome, savedByJudges: false, hadImmunity: false, bonusPoints: 0, bonusNote: null,
    dances: dances.map((d) => ({ danceStyleId: d.style, songTitle: d.song, judgeScores: marks(d.scores) })) };
}
async function checkedSave(entries: ReturnType<typeof entry>[], actor = friend, correctionToken: string | null = null) {
  const result = await db.query<{ data: { acknowledged: string[]; skippedPosted: string[] } }>("select public.save_episode_draft_checked($1) as data", [
    JSON.stringify({ episodeId: episode, updatedBy: actor, guestJudgeName: null, judgesSaveAvailable: false, inJeopardyCoupleIds: [], entries, correctionToken }),
  ]);
  return result.rows[0].data;
}
async function individualDances(couples = [tatyana, maura, amber, julia, connor, ezra]) {
  await checkedSave(couples.map((c, i) => entry(c, [{ style: contemporary, song: `Song ${i}`, scores: [8, 8, 9, 8] }])));
}
async function draftRows(coupleId: string) {
  return (await db.query<{ style: string; song: string | null; total: number; judges: number }>(
    `select d.dance_style_id as style, d.song_title as song, d.total_score::float as total,
       (select count(*) from public.draft_judge_scores j where j.draft_dance_score_id = d.id)::int as judges
     from public.draft_dance_scores d where d.episode_id = $1 and d.couple_id = $2 order by d.song_title`, [episode, coupleId])).rows;
}
async function liveRows(coupleId: string) {
  return (await db.query<{ style: string; song: string | null; total: number }>(
    "select dance_style_id as style, song_title as song, total_score::float as total from public.dance_scores where episode_id = $1 and couple_id = $2 order by song_title", [episode, coupleId])).rows;
}
async function snapshot(): Promise<PublicationSnapshot> {
  return (await db.query<{ data: PublicationSnapshot }>("select public.episode_publication_snapshot($1) as data", [episode])).rows[0].data;
}
async function reveal(coupleId: string, undo = false) {
  const data = await snapshot();
  const plan = buildRevealPlan(data, episode, coupleId, undo);
  await db.query("select public.commit_episode_reveal($1, $2, $3, $4, $5, $6)", [episode, coupleId, admin, JSON.stringify(data), JSON.stringify(plan), undo]);
}
async function finishWeek() {
  const data = await snapshot();
  const plan = buildPublicationPlan(data, episode);
  await db.query("select public.commit_episode_publication($1, $2, $3, $4)", [episode, admin, JSON.stringify(data), JSON.stringify(plan)]);
}

describe("team dances in PostgreSQL", () => {
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
    const migration = readFileSync("supabase/apply-team-dances.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration); // Dashboard reruns must be safe.
    freestyle = (await db.query<{ id: string }>("select id from public.dance_styles where lower(name) = 'freestyle'")).rows[0].id;
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
      insert into public.episodes(id, season_id, week_id, episode_number, airs_at, expected_dance_count) values ('${episode}', '${season}', '${week}', 9, now() - interval '1 hour', 2);
      insert into public.people(id, name, role) values
        ('${judges[0]}', 'Carrie Ann Inaba', 'judge'), ('${judges[1]}', 'Derek Hough', 'judge'), ('${judges[2]}', 'Bruno Tonioli', 'judge');
      insert into public.people(id, name, role, archived_at) values ('${guest}', 'Cynthia Erivo', 'judge', now()), ('${extraGuest}', 'Extra Guest', 'judge', now());
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

  it("saves teams only when every invariant holds", async () => {
    await expect(saveTeams([slaytopia({ captainCoupleId: connor })])).rejects.toThrow(/captain .* must be on the team/);
    await expect(saveTeams([slaytopia({ memberCoupleIds: [tatyana] })])).rejects.toThrow(/at least two couples/);
    await expect(saveTeams([slaytopia(), wildcats({ memberCoupleIds: [connor, amber] })])).rejects.toThrow(/only one team/);
    await expect(saveTeams([slaytopia({ memberCoupleIds: [tatyana, id(99)] })])).rejects.toThrow(/not in this season/);
    await expect(saveTeams([slaytopia({ name: "  " })])).rejects.toThrow(/needs a name/);
    await expect(saveTeams([slaytopia(), slaytopia({ name: "slaytopia", memberCoupleIds: [connor, ezra] })])).rejects.toThrow(/both called/);
    await expect(saveTeams([slaytopia()], friend)).rejects.toThrow(/Only a site admin/);

    const saved = await saveTeams([slaytopia(), wildcats()]);
    expect(saved.teamIds).toHaveLength(2);
    const teams = (await db.query<{ id: string; name: string; dance_style_id: string; captain_couple_id: string; host_name: string | null; updated_at: string }>(
      "select id, name, dance_style_id, captain_couple_id, host_name, updated_at from public.episode_teams where episode_id = $1 order by sort_order", [episode])).rows;
    expect(teams.map((t) => t.name)).toEqual(["Slaytopia", "Wildcats"]);
    expect(teams[0].dance_style_id).toBe(freestyle); // Freestyle by default.
    expect(teams[0]).toMatchObject({ captain_couple_id: tatyana, host_name: "Alfonso Ribeiro" });
    expect((await db.query("select couple_id from public.episode_team_members where team_id = $1", [teams[0].id])).rows).toHaveLength(4);
    await expect(db.query("insert into public.episode_team_members(team_id, episode_id, couple_id) values ($1, $2, $3)", [teams[1].id, episode, amber])).rejects.toThrow(/unique|duplicate/);

    await db.exec("update public.episode_teams set updated_at = now() - interval '1 day'");
    const again = await saveTeams([{ ...slaytopia({ songTitle: "Try Everything" }), id: teams[0].id }]);
    expect(again.teamIds).toEqual([teams[0].id]); // Same id survives an edit; the other team is gone.
    const after = (await db.query<{ id: string; song_title: string; updated_at: string }>("select id, song_title, updated_at from public.episode_teams where episode_id = $1", [episode])).rows;
    expect(after).toHaveLength(1);
    expect(after[0].song_title).toBe("Try Everything");
    expect(new Date(after[0].updated_at).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("fans one set of marks out to eligible members, skips the withdrawn and flags collisions", async () => {
    const [team, cats] = (await saveTeams([slaytopia(), wildcats()])).teamIds;
    await individualDances([tatyana, maura, amber, connor, ezra]);
    // Julia has no individual dance yet; Connor has two non-team dances.
    await checkedSave([entry(connor, [{ style: contemporary, song: "A", scores: [7, 7, 7, 7] }, { style: contemporary, song: "B", scores: [7, 7, 7, 7] }])]);

    const result = await apply(team, [9, 9, 9, 9]);
    expect(result.applied.sort()).toEqual([amber, maura, tatyana].sort());
    expect(result.collisions).toEqual([{ coupleId: julia, teamRows: 0, otherDances: 0 }]);
    expect(result.posted).toEqual([]);
    for (const couple of [tatyana, maura, amber]) {
      const rows = await draftRows(couple);
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.style === freestyle)).toMatchObject({ song: "Zoo", total: 36, judges: 4 });
    }
    expect(await draftRows(julia)).toEqual([]);
    expect((await db.query<{ scaled: number }>("select scaled_score::float as scaled from public.draft_dance_scores where couple_id = $1 and dance_style_id = $2", [amber, freestyle])).rows[0].scaled).toBe(27);

    const cats1 = await apply(cats, [8, 8, 8, 8]);
    expect(cats1.skipped).toEqual([{ coupleId: whitney, reason: "withdrawn" }]);
    expect(cats1.collisions).toEqual([{ coupleId: connor, teamRows: 0, otherDances: 2 }]);
    expect(cats1.applied).toEqual([ezra]);

    // Re-applying changed marks rewrites the same team row instead of adding another.
    const again = await apply(team, [10, 10, 10, 9]);
    expect(again.applied).toHaveLength(3);
    const amberRows = await draftRows(amber);
    expect(amberRows).toHaveLength(2);
    expect(amberRows.find((r) => r.style === freestyle)).toMatchObject({ total: 39, judges: 4 });

    // A member marked Did Not Dance in the draft is skipped too.
    await checkedSave([entry(maura, [], "bye")]);
    expect((await apply(team, [9, 9, 9, 9])).skipped).toEqual([{ coupleId: maura, reason: "bye" }]);
    await expect(apply(team, [9, 9, 9, 9], outsider)).rejects.toThrow(/Not authorized/);
  });

  it("needs exactly four configured judges whose marks all arrive", async () => {
    const [team] = (await saveTeams([slaytopia()])).teamIds;
    await individualDances();
    await db.exec(`delete from public.episode_guest_judges where episode_id = '${episode}'`);
    await expect(apply(team, [9, 9, 9, 9])).rejects.toThrow(/exactly four judges and this night has 3/);
    await db.exec(`insert into public.episode_guest_judges(episode_id, judge_id) values ('${episode}', '${guest}'), ('${episode}', '${extraGuest}')`);
    await expect(apply(team, [9, 9, 9, 9])).rejects.toThrow(/exactly four judges and this night has 5/);
    await db.exec(`delete from public.episode_guest_judges where episode_id = '${episode}' and judge_id = '${extraGuest}'`);
    await expect(db.query("select public.apply_team_dance($1, $2, $3, $4, null)", [episode, friend, team, JSON.stringify(marks([9, 9, 9], judges))])).rejects.toThrow(/all four judges/);
    await expect(db.query("select public.apply_team_dance($1, $2, $3, $4, null)", [episode, friend, team, JSON.stringify(marks([9, 9, 9, 9], [...judges, extraGuest]))])).rejects.toThrow(/exactly this night's four judges/);
    await expect(apply(team, [9, 9, 11, 9])).rejects.toThrow(/between 0 and 10/);
    expect(await draftRows(amber)).toHaveLength(1);
    expect((await apply(team, [9, 9, 9, 9])).applied).toHaveLength(4);
  });

  it("reports instead of silently dropping a save that races a post", async () => {
    await individualDances([amber, julia]);
    await reveal(amber);
    expect(await liveRows(amber)).toHaveLength(1);
    // The friend's autosave carried an edit to Amber that was typed before she was posted.
    const result = await checkedSave([
      entry(amber, [{ style: contemporary, song: "Song 2", scores: [10, 10, 10, 10] }]),
      entry(julia, [{ style: contemporary, song: "Song 3", scores: [9, 9, 9, 9] }]),
    ]);
    expect(result).toEqual({ acknowledged: [julia], skippedPosted: [amber] });
    expect((await draftRows(amber))[0].total).toBe(33); // Unchanged, not the 40 that arrived late.
    expect((await draftRows(julia))[0].total).toBe(36);
    // The legacy RPC would have re-copied live rows over the draft; the checked one leaves them alone.
    const [team] = (await saveTeams([slaytopia({ memberCoupleIds: [amber, julia], captainCoupleId: amber })])).teamIds;
    const applied = await apply(team, [9, 9, 9, 9]);
    expect(applied.applied.sort()).toEqual([amber, julia].sort());
    expect(applied.posted).toEqual([amber]);
    expect(await draftRows(amber)).toHaveLength(2); // Waiting in the draft until she is re-posted.
    expect(await liveRows(amber)).toHaveLength(1);
    // Her draft survives a later save from the friend too.
    await checkedSave([entry(amber, [{ style: contemporary, song: "Song 2", scores: [8, 8, 9, 8] }])]);
    expect(await draftRows(amber)).toHaveLength(2);
  });

  it("refuses to finish the week while a posted couple's draft holds a dance that never went live", async () => {
    const [team] = (await saveTeams([slaytopia({ memberCoupleIds: [amber, julia], captainCoupleId: amber })])).teamIds;
    await individualDances([amber, julia]);
    await reveal(amber); // Amber's individual dance goes live before the team dances.
    await apply(team, [9, 9, 9, 9]); // The late team score lands in both drafts.
    await reveal(julia); // Julia is posted with both dances.
    expect(await liveRows(julia)).toHaveLength(2);
    expect(await liveRows(amber)).toHaveLength(1);
    const data = await snapshot();
    // The client planner refuses first; the RPC refuses even a plan built around it.
    expect(() => buildPublicationPlan(data, episode)).toThrow(/Posted scores for 1 couple differ from their draft/);
    const blind = { ...data, draftDances: data.draftDances.filter((d) => !(d.couple_id === amber && d.dance_style_id === freestyle)) };
    await expect(
      db.query("select public.commit_episode_publication($1, $2, $3, $4)", [episode, admin, JSON.stringify(data), JSON.stringify(buildPublicationPlan(blind, episode))])
    ).rejects.toThrow(/Posted scores for Celebrity 2 differ from their draft/);
    expect((await snapshot()).episodes[0].results_published_at).toBeNull();
    // The override: un-post, then post again from the draft that already holds the team row.
    await reveal(amber, true);
    expect(await liveRows(amber)).toHaveLength(0);
    await reveal(amber);
    expect(await liveRows(amber)).toHaveLength(2);
    await finishWeek();
    const published = await snapshot();
    expect(published.episodes[0].results_published_at).not.toBeNull();
    expect(published.dances.filter((d) => d.couple_id === amber).map((d) => Number(d.total_score)).sort()).toEqual([33, 36]);
    const scores = (await db.query<{ manager_id: string; roster_points: number }>("select manager_id, roster_points::float as roster_points from public.weekly_manager_scores order by manager_id")).rows;
    // Dance Card pays the night once: 33/40 + 36/40 = 69/80 → 25.875 on the 30-point basis.
    expect(scores.find((s) => s.manager_id === admin)?.roster_points).toBe(25.88);
  });

  it("passes a team score through to every member of a published correction", async () => {
    const [team] = (await saveTeams([slaytopia({ memberCoupleIds: [amber, julia], captainCoupleId: amber })])).teamIds;
    await individualDances([amber, julia]);
    await apply(team, [9, 9, 9, 9]);
    await finishWeek();
    await expect(apply(team, [10, 10, 10, 10])).rejects.toThrow(/Only a site admin can correct/);
    await expect(apply(team, [10, 10, 10, 10], admin)).rejects.toThrow(/begin a correction/);
    const token = (await db.query<{ token: string }>("select public.seed_episode_correction($1, $2) as token", [episode, admin])).rows[0].token;
    const corrected = await apply(team, [10, 10, 10, 10], admin);
    expect(corrected.applied.sort()).toEqual([amber, julia].sort());
    expect(corrected.posted).toEqual([]); // Published: nothing is "posted ahead" of the draft.
    expect((await draftRows(amber)).find((r) => r.style === freestyle)).toMatchObject({ total: 40, judges: 4 });
    // A published correction accepts saves for every couple; nothing is skipped as "posted".
    const saved = await checkedSave([entry(amber, [{ style: contemporary, song: "Song 0", scores: [9, 9, 9, 9] }, { style: freestyle, song: "Zoo", scores: [10, 10, 10, 10] }])], admin, token);
    expect(saved).toEqual({ acknowledged: [amber], skippedPosted: [] });
    await finishWeek();
    expect((await liveRows(amber)).map((r) => r.total).sort()).toEqual([36, 40]);
  });

  it("propagates team edits into members' drafts", async () => {
    const [team] = (await saveTeams([slaytopia()])).teamIds;
    await individualDances([tatyana, maura, amber, julia, connor]);
    await apply(team, [9, 9, 9, 9]);
    // Rename the song: every member's team row follows.
    await saveTeams([{ ...slaytopia({ songTitle: "Try Everything" }), id: team }]);
    for (const couple of [tatyana, maura, amber, julia]) {
      expect((await draftRows(couple)).find((r) => r.style === freestyle)).toMatchObject({ song: "Try Everything", total: 36 });
    }
    // Drop Julia and add Connor: Julia loses the team dance, Connor receives the current marks.
    const moved = await saveTeams([{ ...slaytopia({ songTitle: "Try Everything", memberCoupleIds: [tatyana, maura, amber, connor] }), id: team }]);
    expect(moved.collisions).toEqual([]);
    expect(await draftRows(julia)).toHaveLength(1);
    expect((await draftRows(connor)).find((r) => r.style === freestyle)).toMatchObject({ song: "Try Everything", total: 36, judges: 4 });
    // Removing the team takes its dance out of every member's draft.
    await saveTeams([]);
    for (const couple of [tatyana, maura, amber, connor]) expect(await draftRows(couple)).toHaveLength(1);
    expect((await db.query("select * from public.episode_teams")).rows).toEqual([]);
  });

  it("denies the RPCs and tables to anonymous and ordinary signed-in clients", async () => {
    const [team] = (await saveTeams([slaytopia()])).teamIds;
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await expect(db.query("select public.save_episode_teams($1, $2, '[]'::jsonb)", [episode, admin])).rejects.toThrow(/permission denied/i);
        await expect(db.query("select public.apply_team_dance($1, $2, $3, '[]'::jsonb, null)", [episode, admin, team])).rejects.toThrow(/permission denied/i);
        await expect(db.query("select public.save_episode_draft_checked('{}'::jsonb)")).rejects.toThrow(/permission denied/i);
        await expect(db.query("insert into public.episode_teams(episode_id, name, dance_style_id) values ($1, 'X', $2)", [episode, freestyle])).rejects.toThrow(/permission denied/i);
        if (role === "anon") await expect(db.query("select * from public.episode_teams")).rejects.toThrow(/permission denied/i);
        else expect((await db.query("select * from public.episode_team_members")).rows).toHaveLength(4);
      } finally {
        await db.exec("reset role");
      }
    }
  });
});
