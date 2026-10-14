import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildPublicationPlan, type PublicationSnapshot } from "./episode-publication";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1),
  manager = id(2),
  season = id(3),
  week = id(4),
  episode = id(5);
const couple = id(6),
  celebrity = id(7),
  pro = id(8),
  judge = id(9),
  style = id(10),
  draft = id(11),
  league = id(12);
let db: PGlite;

async function snapshot(): Promise<PublicationSnapshot> {
  const result = await db.query<{ data: PublicationSnapshot }>(
    "select public.episode_publication_snapshot($1) as data",
    [episode]
  );
  return result.rows[0].data;
}
async function commit(
  data: PublicationSnapshot,
  plan = buildPublicationPlan(data, episode),
  publisher = admin
) {
  await db.query("select public.commit_episode_publication($1, $2, $3, $4)", [
    episode,
    publisher,
    JSON.stringify(data),
    JSON.stringify(plan),
  ]);
}
async function state() {
  const result = await db.query<{ data: unknown }>(`select jsonb_build_object(
    'snapshot', public.episode_publication_snapshot('${episode}'),
    'scores', (select jsonb_agg(to_jsonb(s) order by id) from public.weekly_manager_scores s),
    'judges', (select jsonb_agg(to_jsonb(s) order by id) from public.judge_scores s),
    'moments', (select jsonb_agg(to_jsonb(s) order by id) from public.episode_custom_moments s)
  ) as data`);
  return result.rows[0].data;
}

describe("atomic episode publication in PostgreSQL", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
      create function auth.uid() returns uuid language sql as 'select null::uuid';`);
    const schema = readFileSync("supabase/schema.sql", "utf8")
      .split("-- Atomic episode publication and score persistence.")[0]
      .replace('create extension if not exists "pgcrypto";', "")
      .replace(/alter publication supabase_realtime add table [^;]+;/g, "");
    await db.exec(schema);
    const migration = readFileSync("supabase/apply-atomic-episode-publication.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration); // Dashboard reruns must be safe.
  }, 30000);
  afterAll(async () => {
    await db?.close();
  });
  beforeEach(async () => {
    await db.exec(`truncate public.seasons, auth.users, public.people, public.dance_styles cascade;
      insert into auth.users(id, email) values ('${admin}', 'admin@example.test'), ('${manager}', 'manager@example.test');
      update public.profiles set is_super_admin = true where id = '${admin}';
      insert into public.seasons(id, name, is_active) values ('${season}', 'Test', true);
      insert into public.competition_weeks(id, season_id, week_number) values ('${week}', '${season}', 1);
      insert into public.episodes(id, season_id, episode_number, week_id, airs_at) values ('${episode}', '${season}', 1, '${week}', now());
      insert into public.people(id, name, role) values ('${celebrity}', 'Celebrity', 'celebrity'), ('${pro}', 'Pro', 'pro'), ('${judge}', 'Judge', 'judge');
      insert into public.couples(id, season_id, celebrity_id, pro_id) values ('${couple}', '${season}', '${celebrity}', '${pro}');
      insert into public.dance_styles(id, name) values ('${style}', 'Waltz');
      insert into public.leagues(id, name, invite_code, commissioner_id) values ('${league}', 'Test', 'TEST', '${admin}');
      insert into public.scoring_settings(league_id, judges_score_multiplier, survival_points, judges_score_category_weight, eliminations_category_weight, bonus_picks_category_weight)
        values ('${league}', 1, 2, 1, 1, 1);
      insert into public.roster_slots(league_id, manager_id, slot_number, couple_id, source, start_week) values ('${league}', '${manager}', 1, '${couple}', 'draft', 1);
      insert into public.draft_episode_overrides(episode_id, updated_by) values ('${episode}', '${admin}');
      insert into public.draft_dance_scores(id, episode_id, couple_id, dance_style_id) values ('${draft}', '${episode}', '${couple}', '${style}');
      insert into public.draft_judge_scores(draft_dance_score_id, judge_id, score) values ('${draft}', '${judge}', 8);
      insert into public.draft_episode_results(episode_id, couple_id, outcome) values ('${episode}', '${couple}', 'safe');
      insert into public.draft_episode_custom_moments(episode_id, couple_id, label) values ('${episode}', '${couple}', 'Test moment');
      insert into public.weekly_manager_scores(league_id, manager_id, week_id, roster_points, prediction_points, grand_finale_points, total_points) values ('${league}', '${manager}', '${week}', 3, 0, 0, 3);`);
  });

  it("commits dances, outcomes, scores, metadata and draft cleanup together", async () => {
    const data = await snapshot();
    const plan = buildPublicationPlan(data, episode);
    expect(plan.weeklyScores[0].roster_points).toBe(26); // 8 × 3 plus survival.
    await commit(data, plan);
    const published = await snapshot();
    expect(published.episodes[0].status).toBe("completed");
    expect(published.episodes[0].results_published_by).toBe(admin);
    expect(published.dances[0].total_score).toBe(8);
    expect(published.dances[0].scaled_score).toBe(24);
    expect(published.draftDances).toEqual([]);
    expect(published.draftOverrides).toEqual([]);
    expect(
      (
        await db.query<{ total_points: number }>(
          "select total_points::float as total_points from public.weekly_manager_scores"
        )
      ).rows[0].total_points
    ).toBe(26);
  });

  it("rolls back every write when inserting computed scores fails", async () => {
    const data = await snapshot();
    const before = await state();
    const plan = buildPublicationPlan(data, episode);
    plan.weeklyScores[0].manager_id = id(99); // FK failure after results were replaced.
    await expect(commit(data, plan)).rejects.toThrow(/foreign key/i);
    expect(await state()).toEqual(before);
  });

  it("rolls back live dance replacement when a correction fails", async () => {
    await commit(await snapshot());
    await db.exec(`insert into public.draft_episode_overrides(episode_id) values ('${episode}');
      insert into public.draft_dance_scores(id, episode_id, couple_id, dance_style_id) values ('${draft}', '${episode}', '${couple}', '${style}');
      insert into public.draft_judge_scores(draft_dance_score_id, judge_id, score) values ('${draft}', '${judge}', 9);
      insert into public.draft_episode_results(episode_id, couple_id, outcome) values ('${episode}', '${couple}', 'safe');`);
    const data = await snapshot();
    const before = await state();
    const plan = buildPublicationPlan(data, episode);
    plan.weeklyScores[0].manager_id = id(99);
    await expect(commit(data, plan)).rejects.toThrow(/foreign key/i);
    expect(await state()).toEqual(before);
    await commit(data);
    expect((await snapshot()).dances[0].scaled_score).toBe(27);
  });

  it("rejects stale draft or scoring inputs before writing", async () => {
    const data = await snapshot();
    await db.exec(
      `update public.scoring_settings set survival_points = 9 where league_id = '${league}';`
    );
    const before = await state();
    await expect(commit(data)).rejects.toThrow(/inputs changed/i);
    expect(await state()).toEqual(before);
  });

  it("preserves already revealed dance IDs and scores", async () => {
    const liveId = id(20);
    await db.exec(`insert into public.dance_scores(id, episode_id, couple_id, dance_style_id, total_score, scaled_score) values ('${liveId}', '${episode}', '${couple}', '${style}', 7, 21);
      insert into public.judge_scores(dance_score_id, judge_id, score) values ('${liveId}', '${judge}', 7);`);
    await commit(await snapshot());
    const published = await snapshot();
    expect(published.dances[0].id).toBe(liveId);
    expect(published.dances[0].scaled_score).toBe(21);
    expect(
      (
        await db.query<{ total_points: number }>(
          "select total_points::float as total_points from public.weekly_manager_scores"
        )
      ).rows[0].total_points
    ).toBe(23);
  });

  it("normalizes a four-judge panel and keeps its raw total", async () => {
    await db.exec(`insert into public.people(id, name, role) values ('${id(
      30
    )}', 'Guest', 'judge'), ('${id(31)}', 'Judge 2', 'judge'), ('${id(32)}', 'Judge 3', 'judge');
      insert into public.draft_judge_scores(draft_dance_score_id, judge_id, score) values ('${draft}', '${id(
      30
    )}', 9), ('${draft}', '${id(31)}', 7), ('${draft}', '${id(32)}', 6);`);
    const data = await snapshot();
    expect(buildPublicationPlan(data, episode).weeklyScores[0].roster_points).toBe(24.5);
    await commit(data);
    expect((await snapshot()).dances[0]).toMatchObject({ total_score: 30, scaled_score: 22.5 });
  });

  it("removes departed couples from future entries in the same commit", async () => {
    const future = id(40),
      nextWeek = id(41);
    await db.exec(`insert into public.competition_weeks(id, season_id, week_number) values ('${nextWeek}', '${season}', 2);
      insert into public.episodes(id, season_id, week_id, episode_number, airs_at) values ('${future}', '${season}', '${nextWeek}', 2, now());
      insert into public.episode_participants(episode_id, couple_id) values ('${future}', '${couple}');
      insert into public.draft_episode_results(episode_id, couple_id, outcome) values ('${future}', '${couple}', 'safe');
      update public.draft_episode_results set outcome = 'eliminated' where episode_id = '${episode}';`);
    const data = await snapshot();
    const plan = buildPublicationPlan(data, episode);
    expect(plan.futureEpisodeIds).toEqual([future]);
    expect(plan.coupleUpdates).toEqual([{ id: couple, status: "eliminated", elimination_week: 1 }]);
    await commit(data);
    expect((await snapshot()).couples[0].status).toBe("eliminated");
    expect((await db.query("select * from public.episode_participants")).rows).toEqual([]);
    expect((await db.query("select * from public.draft_episode_results")).rows).toEqual([]);
  });

  it("shares the anchor-week gate with normal score recomputation", async () => {
    await db.exec(
      `update public.scoring_settings set judges_score_starts_week = 2 where league_id = '${league}';`
    );
    const data = await snapshot();
    expect(buildPublicationPlan(data, episode).weeklyScores[0]?.total_points ?? 0).toBe(0);
    await commit(data);
    const rows = (
      await db.query<{ total_points: number }>(
        "select total_points::float as total_points from public.weekly_manager_scores"
      )
    ).rows;
    expect(rows.reduce((sum, r) => sum + r.total_points, 0)).toBe(0);
  });

  it("scores multi-night weeks and Grand Finale from the projected outcomes", async () => {
    const sibling = id(50);
    await db.exec(`insert into public.episodes(id, season_id, week_id, episode_number, airs_at, results_published_at, status) values ('${sibling}', '${season}', '${week}', 2, now(), now(), 'completed');
      insert into public.dance_scores(episode_id, couple_id, dance_style_id, total_score, scaled_score) values ('${sibling}', '${couple}', '${style}', 7, 21);
      insert into public.episode_results(episode_id, couple_id, outcome) values ('${sibling}', '${couple}', 'safe');`);
    const data = await snapshot();
    expect(buildPublicationPlan(data, episode).weeklyScores[0].roster_points).toBe(47); // 24 + 21 + survival once.
    await db.exec(`update public.draft_episode_results set outcome = 'winner' where episode_id = '${episode}';
      insert into public.grand_finale_predictions(league_id, manager_id, couple_id, predicted_position) values ('${league}', '${manager}', '${couple}', 1);`);
    const finale = await snapshot();
    const plan = buildPublicationPlan(finale, episode);
    expect(plan.weeklyScores[0].grand_finale_points).toBe(8.33);
    expect(plan.coupleUpdates[0]).toMatchObject({ status: "winner", elimination_week: null });
    await commit(finale);
    expect((await snapshot()).couples[0].status).toBe("winner");
  });

  it("reverts a corrected elimination while preserving a sibling's resolved outcome", async () => {
    const sibling = id(51);
    await db.exec(`update public.couples set status = 'eliminated', elimination_week = 1 where id = '${couple}';
      update public.episodes set results_published_at = now(), status = 'completed' where id = '${episode}';
      insert into public.episode_results(episode_id, couple_id, outcome) values ('${episode}', '${couple}', 'eliminated');`);
    let data = await snapshot();
    expect(buildPublicationPlan(data, episode).coupleUpdates).toEqual([
      { id: couple, status: "active", elimination_week: null },
    ]);
    await db.exec(`insert into public.episodes(id, season_id, week_id, episode_number, airs_at) values ('${sibling}', '${season}', '${week}', 2, now());
      insert into public.episode_results(episode_id, couple_id, outcome) values ('${sibling}', '${couple}', 'eliminated');`);
    data = await snapshot();
    expect(buildPublicationPlan(data, episode).coupleUpdates).toEqual([]);
    await commit(data);
    expect((await snapshot()).couples[0].status).toBe("eliminated");
  });

  it("rejects non-admin publishers without changing anything", async () => {
    const data = await snapshot();
    const before = await state();
    await expect(commit(data, buildPublicationPlan(data, episode), manager)).rejects.toThrow(
      /Not authorized/
    );
    expect(await state()).toEqual(before);
  });

  it("denies both RPCs to anonymous and ordinary signed-in clients", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await expect(snapshot()).rejects.toThrow(/permission denied/i);
        await expect(
          db.query("select public.commit_episode_publication($1, $2, '{}'::jsonb, '{}'::jsonb)", [
            episode,
            admin,
          ])
        ).rejects.toThrow(/permission denied/i);
      } finally {
        await db.exec("reset role");
      }
    }
  });
});
