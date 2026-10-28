import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { buildRevealPlan } from "./episode-reveal";
import { buildPublicationPlan, type PublicationSnapshot } from "./episode-publication";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin=id(1), manager=id(2), outsider=id(3), season=id(4), week=id(5), episode=id(6), league=id(7), style=id(8), judge=id(9);
const cast=[id(10),id(11)];
let db: PGlite;
async function asUser(uid: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  await db.exec("set role authenticated");
}
const input = (couple=cast[0], score=8) => ({episodeId:episode,updatedBy:admin,guestJudgeName:null,judgesSaveAvailable:false,inJeopardyCoupleIds:[],entries:[{coupleId:couple,dances:[{danceStyleId:style,songTitle:"Test",judgeScores:[{judgeId:judge,score}]}],outcome:"safe",savedByJudges:false,hadImmunity:false,bonusPoints:0,bonusNote:null}]});
async function save(value: ReturnType<typeof input> & {correctionToken?:string}) {await db.query("select public.save_episode_draft($1)",[JSON.stringify(value)]);}
async function snapshot() {return (await db.query<{data:PublicationSnapshot}>("select public.episode_publication_snapshot($1) as data",[episode])).rows[0].data;}
async function publish() {const data=await snapshot();await db.query("select public.commit_episode_publication($1,$2,$3,$4)",[episode,admin,JSON.stringify(data),JSON.stringify(buildPublicationPlan(data,episode))]);}

describe("audit security and draft lifecycle in PostgreSQL",()=>{
  beforeAll(async()=>{
    db=new PGlite();
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;grant usage on schema auth to anon,authenticated,service_role;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
    const schema=readFileSync("supabase/schema.sql","utf8").replace('create extension if not exists "pgcrypto";',"").replace(/alter publication supabase_realtime add table [^;]+;/g,"");
    await db.exec(schema);
    const migration=readFileSync("supabase/apply-audit-security.sql","utf8");
    await db.exec(migration);await db.exec(migration);
    const deadlines=readFileSync("supabase/apply-audit-deadlines.sql","utf8");await db.exec(deadlines);await db.exec(deadlines);
    const settings=readFileSync("supabase/apply-audit-settings.sql","utf8");await db.exec(settings);await db.exec(settings);
    const provenance=readFileSync("supabase/apply-audit-prediction-provenance.sql","utf8");await db.exec(provenance);await db.exec(provenance);
    const lockGuard=readFileSync("supabase/apply-drop-curtain-call-lock-guard.sql","utf8");await db.exec(lockGuard);await db.exec(lockGuard);
  },30000);
  afterAll(async()=>{await db?.close();});
  beforeEach(async()=>{
    await db.exec(`reset role;truncate public.seasons,public.leagues,auth.users,public.people,public.dance_styles cascade;
      insert into auth.users(id,email) values('${admin}','admin@example.test'),('${manager}','manager@example.test'),('${outsider}','outsider@example.test');
      update public.profiles set is_super_admin=true where id='${admin}';
      insert into public.seasons(id,name,is_active)values('${season}','Test',true);
      insert into public.competition_weeks(id,season_id,week_number)values('${week}','${season}',1);
      insert into public.episodes(id,season_id,week_id,episode_number,airs_at)values('${episode}','${season}','${week}',1,now()+interval '3 hours');
      insert into public.people(id,name,role)values('${id(20)}','A','celebrity'),('${id(21)}','B','celebrity'),('${id(22)}','P','pro'),('${id(23)}','Q','pro'),('${judge}','Judge','judge');
      insert into public.couples(id,season_id,celebrity_id,pro_id)values('${cast[0]}','${season}','${id(20)}','${id(22)}'),('${cast[1]}','${season}','${id(21)}','${id(23)}');
      insert into public.dance_styles(id,name)values('${style}','Waltz');
      insert into public.leagues(id,name,invite_code,commissioner_id)values('${league}','Test','TEST','${admin}');
      insert into public.league_members(league_id,user_id,role)values('${league}','${admin}','commissioner'),('${league}','${manager}','manager');
      insert into public.scoring_settings(league_id)values('${league}');`);
  });
  it("enables RLS on every app table without relying on Supabase event triggers",async()=>{
    expect((await db.query("select tablename from pg_tables join pg_class on relname=tablename join pg_namespace on pg_namespace.oid=relnamespace and nspname=schemaname where schemaname='public' and not relrowsecurity")).rows).toEqual([]);
  });
  it("keeps invitation credentials private while preserving owner access and legitimate redemption",async()=>{
    await asUser(admin);const code=(await db.query<{code:string}>("select public.generate_co_manager_invite_code($1) as code",[league])).rows[0].code;
    expect((await db.query<{code:string}>("select public.my_co_manager_invite_code($1) as code",[league])).rows[0].code).toBe(code);
    await asUser(manager);
    await expect(db.query("select co_manager_invite_code from public.league_members where league_id=$1",[league])).rejects.toThrow(/permission denied/);
    expect((await db.query<{code:string|null}>("select public.my_co_manager_invite_code($1) as code",[league])).rows[0].code).toBeNull();
    await asUser(outsider);await db.query("select public.join_as_co_manager($1)",[code]);
    expect((await db.query<{allowed:boolean}>("select public.is_league_commissioner($1) as allowed",[league])).rows[0].allowed).toBe(true);
  });
  it("does not let a user promote themselves into global results entry",async()=>{
    await asUser(manager);await expect(db.query("update public.profiles set can_propose_results=true where id=$1",[manager])).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.set_results_contributor($1,true)",[manager])).rejects.toThrow(/Only a site admin/);
    await asUser(admin);await db.query("select public.set_results_contributor($1,true)",[manager]);
    await db.exec("reset role");await save({...input(),updatedBy:manager});
  });
  it("rejects non-finite and precision-poisoned settings before they can block publication",async()=>{
    for(const value of ['NaN','Infinity','1e400','1.00000000000000000001']) {
      await expect(db.query("update public.leagues set prediction_lock_hours_before_air=$1 where id=$2",[value,league])).rejects.toThrow(/Invalid numeric/);
      await expect(db.query("update public.scoring_settings set judges_score_category_weight=$1 where league_id=$2",[value,league])).rejects.toThrow(/Invalid numeric/);
    }
    await expect(db.query("update public.leagues set pick_time_limit_seconds=0 where id=$1",[league])).rejects.toThrow(/Pick time/);
  });
  it("rolls back the previous complete draft if a replacement insert fails",async()=>{
    await save(input());const before=await snapshot();
    await expect(save({...input(),entries:[{...input().entries[0],dances:[{danceStyleId:id(99),songTitle:"Invalid",judgeScores:[{judgeId:judge,score:9}]}]}]})).rejects.toThrow(/foreign key/);
    expect(await snapshot()).toEqual(before);
    await save(input(cast[0],9));expect((await snapshot()).draftDances).toHaveLength(1);
  });
  it("does not delete other couples when one couple is replaced",async()=>{
    await save(input());await save(input(cast[1],7));await save(input(cast[0],9));
    const data=await snapshot();expect(data.draftDances).toHaveLength(2);expect(data.draftResults).toHaveLength(2);
  });
  it("rejects invalid judge scores without changing the stored draft",async()=>{
    await save(input());const before=await snapshot();await expect(save(input(cast[0],77))).rejects.toThrow(/Judge scores/);expect(await snapshot()).toEqual(before);
  });
  it("refuses correction seeding on an unpublished episode",async()=>{
    await save(input());const before=await snapshot();await expect(db.query("select public.seed_episode_correction($1,$2)",[episode,admin])).rejects.toThrow(/Only published/);expect(await snapshot()).toEqual(before);
  });
  it("rejects a late ordinary autosave but supports explicit, idempotent corrections",async()=>{
    await save(input());await db.exec(`update public.episodes set results_published_at=now(),status='completed' where id='${episode}';delete from public.draft_episode_overrides where episode_id='${episode}';`);
    await expect(save(input())).rejects.toThrow(/explicit correction/);
    const token=(await db.query<{token:string}>("select public.seed_episode_correction($1,$2) as token",[episode,admin])).rows[0].token;
    await save({...input(cast[0],9),correctionToken:token});
    expect((await db.query<{token:string}>("select public.seed_episode_correction($1,$2) as token",[episode,admin])).rows[0].token).toBe(token);
    expect((await snapshot()).draftJudges[0].score).toBe(9);
  });
  it("rejects incomplete correction publication instead of deleting missing live couples",async()=>{
    await save(input());await db.exec(`update public.episodes set results_published_at=now(),status='completed' where id='${episode}';insert into public.episode_results(episode_id,couple_id,outcome)values('${episode}','${cast[1]}','eliminated');`);
    const before=await snapshot();await expect(publish()).rejects.toThrow(/Incomplete correction/);expect(await snapshot()).toEqual(before);
  });
  it("keeps an expired bracket deadline when an exempt league moves its anchor or resets its draft",async()=>{
    await db.exec(`update public.leagues set draft_status='completed' where id='${league}';
      update public.scoring_settings set locking_exempt=true,bonus_picks_category_enabled=true,bonus_picks_scoring_method='exact_position' where league_id='${league}';
      insert into public.competition_weeks(id,season_id,week_number)values('${id(40)}','${season}',2);
      insert into public.episodes(id,season_id,week_id,episode_number,airs_at)values('${id(41)}','${season}','${id(40)}',2,now()+interval '1 week');
      update public.episodes set airs_at=now()-interval '1 hour' where id='${episode}';`);
    const old=(await db.query<{deadline:string}>("select public.effective_grand_finale_deadline($1) as deadline",[league])).rows[0].deadline;
    await db.exec(`update public.scoring_settings set judges_score_starts_week=2 where league_id='${league}';update public.leagues set draft_status='not_started' where id='${league}';`);
    expect((await db.query<{deadline:string}>("select public.effective_grand_finale_deadline($1) as deadline",[league])).rows[0].deadline).toEqual(old);
    await asUser(manager);await expect(db.query("select public.submit_grand_finale_prediction($1,$2)",[league,cast])).rejects.toThrow(/locked/);
  });
  it("prevents self-unlock and waits for an aired week to finish before accepting another manager's late entry",async()=>{
    await db.exec(`update public.leagues set draft_status='completed' where id='${league}';update public.scoring_settings set bonus_picks_category_enabled=true,bonus_picks_scoring_method='exact_position' where league_id='${league}';update public.episodes set airs_at=now()-interval '1 hour' where id='${episode}';`);
    await asUser(admin);await expect(db.query("select public.unlock_grand_finale_late($1,$2,1,false)",[league,admin])).rejects.toThrow(/own team/);
    await db.query("select public.unlock_grand_finale_late($1,$2,1,false)",[league,manager]);
    await asUser(manager);await expect(db.query("select public.submit_grand_finale_prediction($1,$2)",[league,cast])).rejects.toThrow(/current competition week/);
    await db.exec(`reset role;update public.episodes set results_published_at=now(),status='completed' where id='${episode}';`);
    await asUser(manager);expect((await db.query("select * from public.submit_grand_finale_prediction($1,$2)",[league,cast])).rows).toHaveLength(2);
  });
  it("lets a commissioner reopen an already-locked week",async()=>{
    await db.exec(`update public.episodes set airs_at=now()-interval '1 hour' where id='${episode}';`);
    await asUser(admin);await db.query("select public.update_league_settings($1,'locked',null,60,-1.5,'east','snake',null)",[league]);
    await asUser(manager);await db.query("select public.submit_prediction($1,$2,$3,null,null)",[league,week,cast[0]]);
  });

  it("installs reveals atomically and rejects a stale second post",async()=>{
    await db.exec(`insert into public.roster_slots(league_id,manager_id,couple_id,slot_number,source,start_week)values('${league}','${manager}','${cast[0]}',1,'draft',1);`);
    await save(input());const data=await snapshot(),plan=buildRevealPlan(data,episode,cast[0],false);
    const commit=()=>db.query("select public.commit_episode_reveal($1,$2,$3,$4,$5,false)",[episode,cast[0],admin,JSON.stringify(data),JSON.stringify(plan)]);
    await commit();await expect(commit()).rejects.toThrow(/inputs changed|already posted/);
    expect((await snapshot()).dances).toHaveLength(1);
    const undoData=await snapshot(),undoPlan=buildRevealPlan(undoData,episode,cast[0],true);
    await db.query("select public.commit_episode_reveal($1,$2,$3,$4,$5,true)",[episode,cast[0],admin,JSON.stringify(undoData),JSON.stringify(undoPlan)]);
    expect((await snapshot()).dances).toHaveLength(0);
  });
  it("rolls back reveal dances when installing standings fails",async()=>{
    await db.exec(`insert into public.roster_slots(league_id,manager_id,couple_id,slot_number,source,start_week)values('${league}','${manager}','${cast[0]}',1,'draft',1);`);
    await save(input());const before=await snapshot(),plan=buildRevealPlan(before,episode,cast[0],false);plan.weeklyScores[0].manager_id=id(99);
    await expect(db.query("select public.commit_episode_reveal($1,$2,$3,$4,$5,false)",[episode,cast[0],admin,JSON.stringify(before),JSON.stringify(plan)])).rejects.toThrow(/foreign key/);
    expect(await snapshot()).toEqual(before);
  });
  it("does not erase already-paid predictions and Grand Finale during a second-night reveal",async()=>{
    await db.exec(`insert into public.roster_slots(league_id,manager_id,couple_id,slot_number,source,start_week)values('${league}','${manager}','${cast[0]}',1,'draft',1);
      insert into public.weekly_manager_scores(league_id,manager_id,week_id,roster_points,prediction_points,grand_finale_points,total_points)values('${league}','${manager}','${week}',2,10,8.33,20.33);`);
    await save(input());const plan=buildRevealPlan(await snapshot(),episode,cast[0],false);
    expect(plan.weeklyScores[0].prediction_points).toBe(10);expect(plan.weeklyScores[0].grand_finale_points).toBe(8.33);
    expect(plan.weeklyScores[0].roster_points).toBeGreaterThan(2);
  });
  it("rejects an undo after official publication instead of deleting published dances",async()=>{
    await save(input());const data=await snapshot(),plan=buildRevealPlan(data,episode,cast[0],false);
    await db.query("select public.commit_episode_reveal($1,$2,$3,$4,$5,false)",[episode,cast[0],admin,JSON.stringify(data),JSON.stringify(plan)]);
    const before=await snapshot(),undoPlan=buildRevealPlan(before,episode,cast[0],true);
    await db.exec(`update public.episodes set results_published_at=now(),status='completed' where id='${episode}';`);
    await expect(db.query("select public.commit_episode_reveal($1,$2,$3,$4,$5,true)",[episode,cast[0],admin,JSON.stringify(before),JSON.stringify(undoPlan)])).rejects.toThrow(/already published/);
    expect((await snapshot()).dances).toHaveLength(1);
  });
  it("rejects stale settings before a stale form can overwrite draft calibration",async()=>{
    const old=(await db.query<{revision:number}>("select revision from public.scoring_settings where league_id=$1",[league])).rows[0].revision;
    await db.query("update public.scoring_settings set judges_score_multiplier=0.2449 where league_id=$1",[league]);
    await asUser(admin);await expect(db.query("select public.update_scoring_categories_checked($1,$2,$3)",[league,old,JSON.stringify({judges_score_multiplier:0.1421})])).rejects.toThrow(/another tab/);
  });

  it("credits both nights' resolved couples and does not let an earlier safe row override a later elimination",async()=>{
    await save({...input(),entries:[{...input().entries[0],outcome:'eliminated'}]});await save(input(cast[1],7));
    await db.exec(`update public.scoring_settings set judges_score_multiplier=1,survival_points=2,first_place_points=0,second_place_points=0,third_place_points=0,fourth_place_points=0,fifth_place_points=0,bonus_picks_category_enabled=true,bonus_picks_scoring_method='exact_position' where league_id='${league}';
      insert into public.episodes(id,season_id,week_id,episode_number,airs_at,results_published_at,status)values('${id(50)}','${season}','${week}',2,now(),now(),'completed');
      insert into public.episode_results(episode_id,couple_id,outcome)values('${id(50)}','${cast[1]}','eliminated');
      update public.couples set status='eliminated',elimination_week=1 where id='${cast[1]}';
      insert into public.roster_slots(league_id,manager_id,couple_id,slot_number,source,start_week)values('${league}','${manager}','${cast[1]}',1,'draft',1);
      insert into public.grand_finale_predictions(league_id,manager_id,couple_id,predicted_position)values('${league}','${manager}','${cast[0]}',1),('${league}','${manager}','${cast[1]}',2);`);
    const row=buildPublicationPlan(await snapshot(),episode).weeklyScores.find((value)=>value.manager_id===manager)!;
    expect(row.grand_finale_points).toBe(16.66);expect(row.roster_points).toBe(21);
  });
  it("starts a Recast in the next unaired week and cannot reject an already-finalized claim",async()=>{
    await db.exec(`update public.leagues set waiver_mode='waivers',waiver_claim_method='fcfs' where id='${league}';
      update public.couples set status='eliminated',elimination_week=1 where id='${cast[0]}';
      insert into public.roster_slots(league_id,manager_id,couple_id,slot_number,source,start_week)values('${league}','${manager}','${cast[0]}',1,'draft',1);
      update public.episodes set airs_at=now()-interval '2 days',results_published_at=now(),status='completed' where id='${episode}';
      insert into public.competition_weeks(id,season_id,week_number)values('${id(51)}','${season}',2),('${id(52)}','${season}',3);
      insert into public.episodes(id,season_id,week_id,episode_number,airs_at)values('${id(53)}','${season}','${id(51)}',2,now()-interval '1 hour'),('${id(54)}','${season}','${id(52)}',3,now()+interval '1 week');`);
    await asUser(manager);const claim=(await db.query<{id:string;week_number:number}>("select * from public.submit_waiver_claim($1,1,$2)",[league,cast[1]])).rows[0];
    expect(claim.week_number).toBe(2);
    expect((await db.query<{start_week:number}>("select start_week from public.roster_slots where league_id=$1 and couple_id=$2 and end_week is null",[league,cast[1]])).rows[0].start_week).toBe(3);
    await asUser(admin);await expect(db.query("select public.reject_waiver_claim($1)",[claim.id])).rejects.toThrow(/already been resolved/);
  });
  it("records the actual app actor and requires a site-admin reason for backfills",async()=>{
    await db.exec(`update public.scoring_settings set eliminations_category_enabled=true where league_id='${league}';`);
    await asUser(manager);await db.query("select public.submit_prediction($1,$2,$3,null,$4)",[league,week,cast[0],cast[1]]);
    const row=(await db.query<{entered_by:string;entered_via:string}>("select entered_by,entered_via from public.predictions where league_id=$1",[league])).rows[0];
    expect(row).toEqual({entered_by:manager,entered_via:'app'});
    await expect(db.query("select public.admin_backfill_prediction($1,$2,$3,$4,null,$5,now(),'Confirmed before lock')",[league,week,manager,cast[0],cast[1]])).rejects.toThrow(/Only a site admin/);
    await asUser(admin);await db.query("select public.admin_backfill_prediction($1,$2,$3,$4,null,$5,now(),'Confirmed before lock')",[league,week,manager,cast[0],cast[1]]);
    await db.exec("reset role");
    expect((await db.query<{entered_via:string}>("select entered_via from public.predictions where league_id=$1",[league])).rows[0].entered_via).toBe('admin_backfill');
  });

  it("saves a current settings revision through the checked RPC",async()=>{
    await asUser(admin);
    const settings=(await db.query<{data:{revision:number;survival_points:number}}>("select to_jsonb(s) as data from public.scoring_settings s where league_id=$1",[league])).rows[0].data;
    const result=(await db.query<{survival_points:number;revision:number}>("select * from public.update_scoring_categories_checked($1,$2,$3)",[league,settings.revision,JSON.stringify({...settings,survival_points:3})])).rows[0];
    expect(Number(result.survival_points)).toBe(3);
    expect(result.revision).toBe(settings.revision+1);
  });

  it("returns real custom-event ids and prevents non-admin published correction writes",async()=>{
    const moment=(await db.query<{id:string}>("select public.mutate_draft_moment($1,$2,null,null,'Synthetic event',false) as id",[episode,admin])).rows[0].id;
    expect(moment).toMatch(/^[0-9a-f-]{36}$/);
    await db.query("select public.mutate_draft_moment($1,$2,$3,null,null,true)",[episode,admin,moment]);
    expect((await snapshot()).draftMoments).toHaveLength(0);
    await db.exec(`update public.profiles set can_propose_results=true where id='${manager}';update public.episodes set results_published_at=now(),status='completed' where id='${episode}';`);
    await expect(db.query("select public.mutate_draft_moment($1,$2,null,null,'Forbidden correction',false)",[episode,manager])).rejects.toThrow(/Only a site admin/);
  });

});
