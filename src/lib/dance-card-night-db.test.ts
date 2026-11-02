import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildRevealPlan } from "./episode-reveal";
import { buildPublicationPlan, type PublicationSnapshot } from "./episode-publication";

// Disney Night shape: four judges, every couple dances once on their own and
// once with their team, entered as a second dance row. Dance Card must pay
// the night once (64/80 → 24), through reveal, undo and Finish Week alike.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1), amberManager = id(2), juliaManager = id(3), season = id(4), week = id(5), episode = id(6);
const league = id(7), flatLeague = id(8), quickstep = id(9), freestyle = id(10);
const judges = [id(11), id(12), id(13), id(14)];
const amber = id(20), julia = id(21);
let db: PGlite;

const dance = (styleId: string, marks: number[]) => ({
  danceStyleId: styleId,
  songTitle: null,
  judgeScores: marks.map((score, i) => ({ judgeId: judges[i], score })),
});
const entry = (coupleId: string, dances: ReturnType<typeof dance>[]) => ({
  coupleId,
  dances,
  outcome: "safe",
  savedByJudges: false,
  hadImmunity: false,
  bonusPoints: 0,
  bonusNote: null,
});
async function save(entries: ReturnType<typeof entry>[]) {
  await db.query("select public.save_episode_draft($1)", [
    JSON.stringify({ episodeId: episode, updatedBy: admin, guestJudgeName: null, judgesSaveAvailable: false, inJeopardyCoupleIds: [], entries }),
  ]);
}
async function snapshot() {
  return (await db.query<{ data: PublicationSnapshot }>("select public.episode_publication_snapshot($1) as data", [episode])).rows[0].data;
}
async function reveal(coupleId: string, undo: boolean) {
  const data = await snapshot();
  const plan = buildRevealPlan(data, episode, coupleId, undo);
  await db.query("select public.commit_episode_reveal($1,$2,$3,$4,$5,$6)", [episode, coupleId, admin, JSON.stringify(data), JSON.stringify(plan), undo]);
}
async function publish() {
  const data = await snapshot();
  await db.query("select public.commit_episode_publication($1,$2,$3,$4)", [episode, admin, JSON.stringify(data), JSON.stringify(buildPublicationPlan(data, episode))]);
}
async function storedScores() {
  return (
    await db.query<{ league_id: string; manager_id: string; roster_points: number; prediction_points: number; total_points: number }>(
      "select league_id, manager_id, roster_points::float as roster_points, prediction_points::float as prediction_points, total_points::float as total_points from public.weekly_manager_scores order by league_id, manager_id"
    )
  ).rows;
}

describe("Dance Card per-night pay through reveal and publication in PostgreSQL", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;grant usage on schema auth to anon,authenticated,service_role;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
    const schema = readFileSync("supabase/schema.sql", "utf8")
      .replace('create extension if not exists "pgcrypto";', "")
      .replace(/alter publication supabase_realtime add table [^;]+;/g, "");
    await db.exec(schema);
    for (const file of [
      "supabase/apply-audit-security.sql",
      "supabase/apply-audit-deadlines.sql",
      "supabase/apply-audit-settings.sql",
      "supabase/apply-audit-prediction-provenance.sql",
      "supabase/apply-drop-curtain-call-lock-guard.sql",
    ]) {
      await db.exec(readFileSync(file, "utf8"));
    }
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  beforeEach(async () => {
    await db.exec(`reset role;truncate public.seasons,public.leagues,auth.users,public.people,public.dance_styles cascade;
      insert into auth.users(id,email) values('${admin}','admin@example.test'),('${amberManager}','amber-manager@example.test'),('${juliaManager}','julia-manager@example.test');
      update public.profiles set is_super_admin=true where id='${admin}';
      insert into public.seasons(id,name,is_active) values('${season}','Test',true);
      insert into public.competition_weeks(id,season_id,week_number) values('${week}','${season}',8);
      insert into public.episodes(id,season_id,week_id,episode_number,airs_at,expected_dance_count) values('${episode}','${season}','${week}',9,now(),2);
      insert into public.people(id,name,role) values('${id(30)}','Amber','celebrity'),('${id(31)}','Julia','celebrity'),('${id(32)}','Pasha','pro'),('${id(33)}','Val','pro'),
        ('${judges[0]}','Carrie Ann','judge'),('${judges[1]}','Derek','judge'),('${judges[2]}','Bruno','judge'),('${judges[3]}','Cynthia','judge');
      insert into public.couples(id,season_id,celebrity_id,pro_id) values('${amber}','${season}','${id(30)}','${id(32)}'),('${julia}','${season}','${id(31)}','${id(33)}');
      insert into public.dance_styles(id,name) values('${quickstep}','Quickstep'),('${freestyle}','Freestyle');
      insert into public.leagues(id,name,invite_code,commissioner_id) values('${league}','Calibrated','TEST1','${admin}'),('${flatLeague}','Flat','TEST2','${admin}');
      insert into public.league_members(league_id,user_id,role) values('${league}','${admin}','commissioner'),('${league}','${amberManager}','manager'),('${league}','${juliaManager}','manager'),
        ('${flatLeague}','${admin}','commissioner'),('${flatLeague}','${amberManager}','manager');
      insert into public.scoring_settings(league_id,judges_score_multiplier,survival_points,judges_score_category_weight,eliminations_category_weight,bonus_picks_category_weight,judges_score_starts_week)
        values('${league}',0.2449,1.56,1,1,1,1),('${flatLeague}',1,1.56,1,1,1,1);
      insert into public.roster_slots(league_id,manager_id,slot_number,couple_id,source,start_week) values
        ('${league}','${amberManager}',1,'${amber}','draft',1),('${league}','${juliaManager}',1,'${julia}','draft',1),('${flatLeague}','${amberManager}',1,'${amber}','draft',1);`);
    // Amber: Quickstep 28/40 then the team Freestyle 36/40. Julia: one 33/40.
    await save([
      entry(amber, [dance(quickstep, [7, 7, 7, 7]), dance(freestyle, [9, 9, 9, 9])]),
      entry(julia, [dance(quickstep, [9, 8, 8, 8])]),
    ]);
  });

  it("posts a two-dance couple as one 64/80 night in every league, and undo restores the stored rows exactly", async () => {
    await db.exec(`insert into public.weekly_manager_scores(league_id,manager_id,week_id,roster_points,prediction_points,grand_finale_points,total_points)
      values('${league}','${amberManager}','${week}',3,10,0,13);`);
    const before = await storedScores();

    await reveal(amber, false);
    const live = (await db.query<{ total_score: number; scaled_score: number }>(
      "select total_score::float as total_score, scaled_score::float as scaled_score from public.dance_scores where couple_id=$1 order by total_score", [amber]
    )).rows;
    expect(live).toEqual([{ total_score: 28, scaled_score: 21 }, { total_score: 36, scaled_score: 27 }]);
    const posted = await storedScores();
    // 24 × 0.2449 = 5.8776 on top of the stored 3; predictions untouched.
    expect(posted.find((r) => r.league_id === league && r.manager_id === amberManager)).toMatchObject({ roster_points: 8.88, prediction_points: 10, total_points: 18.88 });
    // Not 21 + 27 = 48 in the flat league either.
    expect(posted.find((r) => r.league_id === flatLeague && r.manager_id === amberManager)).toMatchObject({ roster_points: 24, total_points: 24 });

    await reveal(amber, true);
    expect((await db.query("select 1 from public.dance_scores")).rows).toEqual([]);
    const undone = await storedScores();
    expect(undone.find((r) => r.league_id === league && r.manager_id === amberManager)).toEqual(before[0]);
    expect(undone.find((r) => r.league_id === flatLeague && r.manager_id === amberManager)).toMatchObject({ roster_points: 0, total_points: 0 });
  });

  it("Finish Week stores 24 × multiplier plus survival whether or not the couple was posted first", async () => {
    const data = await snapshot();
    const plan = buildPublicationPlan(data, episode);
    const row = (managerId: string, leagueId = league) => plan.weeklyScores.find((r) => r.league_id === leagueId && r.manager_id === managerId)!;
    expect(row(amberManager).roster_points).toBe(7.44); // 24 × 0.2449 + 1.56 = 7.4376
    expect(row(juliaManager).roster_points).toBe(7.62); // 24.75 × 0.2449 + 1.56 = 7.6213
    expect(row(amberManager, flatLeague).roster_points).toBe(25.56); // 24 + 1.56, not 48 + 1.56

    await reveal(amber, false);
    await reveal(julia, false);
    await publish();
    const stored = await storedScores();
    expect(stored.find((r) => r.league_id === league && r.manager_id === amberManager)).toMatchObject({ roster_points: 7.44, total_points: 7.44 });
    expect(stored.find((r) => r.league_id === league && r.manager_id === juliaManager)).toMatchObject({ roster_points: 7.62, total_points: 7.62 });
    expect(stored.find((r) => r.league_id === flatLeague && r.manager_id === amberManager)).toMatchObject({ roster_points: 25.56 });
    expect((await db.query("select 1 from public.dance_scores where couple_id=$1", [amber])).rows).toHaveLength(2);
  });
});
