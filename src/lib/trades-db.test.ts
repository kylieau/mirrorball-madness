import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPublicationPlan, type LifelineInputs, type PublicationSnapshot } from "./episode-publication";

// A v3 league of four teams (two-couple rosters, Anchor Week 8) through three
// waiver runs with Trades on. Week 8 sends F home, leaving Admin an open
// spot; I and J were never drafted. Week 11 is the Semi-Finals, Week 12 the Finale.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1), friend = id(2), third = id(3), partner = id(5), outsider = id(6), fourth = id(61);
const season = id(4), league = id(7), rumba = id(9);
const [week8, week9, week10, week11, week12] = [id(10), id(11), id(12), id(13), id(14)];
const [e09, e10, e11, e12, e13] = [id(15), id(16), id(17), id(18), id(19)];
const judges = [id(20), id(21), id(22)];
const [a, b, c, d, e, f, g, h, i, j] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => id(30 + n));

const LIVE_STACK = [
  "apply-audit-security", "apply-audit-deadlines", "apply-audit-settings", "apply-audit-prediction-provenance",
  "apply-curtain-call-backfill", "apply-curtain-call-backfill-lock-check", "apply-service-role-season-grants",
  "apply-drop-curtain-call-lock-guard", "apply-team-dance-entity", "apply-special-dances", "apply-special-dances-polish",
  "apply-draft-release-own-rows", "apply-whole-judge-marks", "apply-special-draft-release",
  "apply-contributor-special-setup", "apply-draft-lineup", "apply-retire-special-leftovers", "apply-episode-rounds",
  "apply-special-dance-label", "apply-dance-card-v2", "apply-dance-card-v3", "apply-lifeline", "apply-recast-v2",
  "apply-trades",
];
let db: PGlite;

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
  const person = (base: number) => `('00000000-0000-4000-8000-' || lpad((${base} + n)::text, 12, '0'))::uuid`;
  await db.exec(`insert into public.dance_styles(id, name, category) values ('${rumba}', 'Rumba', 'latin');
    insert into auth.users(id, email) values ('${admin}', 'admin@example.test'), ('${friend}', 'friend@example.test'),
      ('${third}', 'third@example.test'), ('${fourth}', 'fourth@example.test'), ('${partner}', 'partner@example.test'),
      ('${outsider}', 'outsider@example.test');
    update public.profiles set is_super_admin = true where id = '${admin}';
    update public.profiles set can_propose_results = true where id = '${friend}';
    insert into public.seasons(id, name, is_active) values ('${season}', 'S35', true);
    insert into public.competition_weeks(id, season_id, week_number, is_finale) values
      ('${week8}', '${season}', 8, false), ('${week9}', '${season}', 9, false), ('${week10}', '${season}', 10, false),
      ('${week11}', '${season}', 11, false), ('${week12}', '${season}', 12, true);
    insert into public.episodes(id, season_id, week_id, episode_number, airs_at, expected_dance_count) values
      ('${e09}', '${season}', '${week8}', 9, now() - interval '9 days', 1),
      ('${e10}', '${season}', '${week9}', 10, now() - interval '47 hours', 1),
      ('${e11}', '${season}', '${week10}', 11, now() + interval '5 days', 1),
      ('${e12}', '${season}', '${week11}', 12, now() + interval '12 days', 1),
      ('${e13}', '${season}', '${week12}', 13, now() + interval '19 days', 1);
    insert into public.people(id, name, role) values
      ('${judges[0]}', 'Carrie Ann Inaba', 'judge'), ('${judges[1]}', 'Derek Hough', 'judge'), ('${judges[2]}', 'Bruno Tonioli', 'judge');
    insert into public.people(id, name, role) select ${person(40)}, 'Celebrity ' || n, 'celebrity' from generate_series(0, 9) n;
    insert into public.people(id, name, role) select ${person(50)}, 'Pro ' || n, 'pro' from generate_series(0, 9) n;
    insert into public.couples(id, season_id, celebrity_id, pro_id)
      select ${person(30)}, '${season}', ${person(40)}, ${person(50)} from generate_series(0, 9) n;
    insert into public.leagues(id, name, invite_code, commissioner_id, roster_size) values ('${league}', 'Trades', 'TRADES', '${admin}', 2);
    insert into public.league_members(league_id, user_id, role, co_manager_id, draft_position) values
      ('${league}', '${admin}', 'commissioner', null, 1), ('${league}', '${friend}', 'manager', '${partner}', 2),
      ('${league}', '${third}', 'manager', null, 3), ('${league}', '${fourth}', 'manager', null, 4);
    insert into public.scoring_settings(league_id, judges_score_starts_week, judges_score_category_weight, dance_card_version)
      values ('${league}', 8, 1, 'v3');
    insert into public.roster_slots(league_id, manager_id, slot_number, couple_id, source, start_week) values
      ('${league}', '${admin}', 1, '${a}', 'draft', 1), ('${league}', '${admin}', 2, '${f}', 'draft', 1),
      ('${league}', '${friend}', 1, '${g}', 'draft', 1), ('${league}', '${friend}', 2, '${e}', 'draft', 1),
      ('${league}', '${third}', 1, '${b}', 'draft', 1), ('${league}', '${third}', 2, '${c}', 'draft', 1),
      ('${league}', '${fourth}', 1, '${d}', 'draft', 1), ('${league}', '${fourth}', 2, '${h}', 'draft', 1);`);
}, 120000);
afterAll(async () => db?.close());

async function asUser(uid: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.exec("set role authenticated");
}
async function asService() {
  await db.exec("reset role");
}
async function saveNight(episode: string, dancing: string[], eliminated: string[] = []) {
  const entries = [...dancing, ...eliminated].map((couple) => ({
    coupleId: couple, outcome: eliminated.includes(couple) ? "eliminated" : "safe", savedByJudges: false, hadImmunity: false,
    bonusPoints: 0, bonusNote: null,
    dances: [{ danceStyleId: rumba, songTitle: "Song", judgeScores: judges.map((judgeId) => ({ judgeId, score: 8 })) }],
  }));
  await db.query("select public.save_episode_draft_checked($1)", [
    JSON.stringify({ episodeId: episode, updatedBy: friend, guestJudgeName: null, judgesSaveAvailable: false, inJeopardyCoupleIds: [], entries, correctionToken: null }),
  ]);
}
async function finishWeek(episode: string) {
  const data = (await db.query<{ data: PublicationSnapshot }>("select public.episode_publication_snapshot($1) as data", [episode])).rows[0].data;
  const lifeline = (await db.query<{ data: LifelineInputs }>("select public.lifeline_publication_inputs() as data")).rows[0].data;
  const plan = buildPublicationPlan(data, episode, lifeline);
  await db.query("select public.commit_episode_publication_with_later_weeks($1, $2, $3, $4)", [episode, admin, JSON.stringify(data), JSON.stringify(plan)]);
}
type Leg = { from: string; to: string; couple?: string; points?: number };
const propose = async (legs: Leg[]) =>
  (await db.query<{ id: string }>("select public.propose_trade($1, $2) as id", [
    league,
    JSON.stringify(legs.map((leg) => ({ from_manager_id: leg.from, to_manager_id: leg.to, couple_id: leg.couple ?? null, points: leg.points ?? null }))),
  ])).rows[0].id;
const respond = async (trade: string, accept: boolean) =>
  (await db.query<{ status: string }>("select public.respond_to_trade($1, $2) as status", [trade, accept])).rows[0].status;
const veto = async (trade: string) => (await db.query<{ status: string }>("select public.veto_trade($1) as status", [trade])).rows[0].status;
const offer = async (trade: string) =>
  (await db.query<{ status: string; result: string | null; week: number | null; start: number | null }>(
    "select status, result, week_number as week, start_week as start from public.trade_offers where id = $1", [trade])).rows[0];
const visibleOffers = async () => (await db.query<{ id: string }>("select id from public.trade_offers")).rows.map((row) => row.id);
const cashAvailable = async () =>
  (await db.query<{ room: number }>("select public.trade_cash_available($1)::float as room", [league])).rows[0].room;
const vetoWindowOver = (...trades: string[]) =>
  db.query("update public.trade_offers set veto_ends_at = now() - interval '1 minute' where id = any ($1)", [trades]);
const saveList = (claims: { couple: string; slot: number; drop?: string }[]) =>
  db.query("select * from public.save_recast_list($1, $2)", [
    league,
    JSON.stringify(claims.map((claim) => ({ couple_id: claim.couple, slot_number: claim.slot, drop_couple_id: claim.drop ?? null }))),
  ]);
const aired = (episode: string, hoursAgo: number) =>
  db.query(`update public.episodes set airs_at = now() - interval '${hoursAgo} hours' where id = $1`, [episode]);
// These tests move air times, not the clock, so Trades have to have been on
// a while: since after Week 8's run came due, which they were too late for.
const tradesOnAWhile = () => db.query("update public.leagues set trades_on_since = now() - interval '3 days'");
const processDue = async () => (await db.query<{ runs: unknown[] }>("select public.process_due_recasts() as runs")).rows[0].runs;
const roster = async (managerId: string) =>
  (await db.query<{ slot: number; couple_id: string; source: string; start: number; end: number | null }>(
    `select slot_number as slot, couple_id, source, start_week as start, end_week as end
     from public.roster_slots where league_id = $1 and manager_id = $2 order by slot_number, start_week`, [league, managerId])).rows;
const transfers = async (weekId: string) =>
  Object.fromEntries(
    (await db.query<{ manager_id: string; points: number }>(
      "select manager_id, transfer_points::float as points from public.weekly_manager_standings where league_id = $1 and week_id = $2", [league, weekId])).rows
      .map((row) => [row.manager_id, row.points])
  );

let adminCash: number;
let cashTrade: string, threeWay: string, swap: string, stale: string;

describe("Trades with points as cash", () => {
  it("are off until the commissioner turns them on, and then run with or without Recast", async () => {
    await saveNight(e09, [a, b, c, d, e, g, h, i, j], [f]);
    await finishWeek(e09);
    await saveNight(e10, [a, b, c, d, e, g, h, i, j]);
    await finishWeek(e10);

    await asUser(admin);
    await expect(propose([{ from: friend, to: admin, couple: e }])).rejects.toThrow(/does not use Trades/);
    await asUser(friend);
    await expect(db.query("select public.set_trades_enabled($1, true)", [league])).rejects.toThrow(/Only a commissioner/);
    await asService();
    expect((await db.query("select * from public.recast_next_cycle($1)", [league])).rows).toEqual([]);
    await asUser(admin);
    await db.query("select public.set_trades_enabled($1, true)", [league]);
    await asService();
    await tradesOnAWhile();
    expect((await db.query("select week_number, start_week from public.recast_next_cycle($1)", [league])).rows).toEqual([{ week_number: 9, start_week: 10 }]);
  });

  it("refuses a trade that can't happen as offered", async () => {
    await asUser(outsider);
    await expect(propose([{ from: friend, to: outsider, couple: e }])).rejects.toThrow(/not a member/);
    await asUser(admin);
    adminCash = await cashAvailable();
    expect(adminCash).toBeGreaterThan(1);
    await expect(propose([{ from: friend, to: fourth, couple: e }])).rejects.toThrow(/part of a trade you propose/);
    await expect(propose([{ from: admin, to: friend, points: 1 }])).rejects.toThrow(/at least one couple/);
    await expect(propose([{ from: friend, to: admin, couple: b }])).rejects.toThrow(/no longer on that roster/);
    await expect(propose([{ from: admin, to: friend, couple: f }])).rejects.toThrow(/no longer dancing/);
    await expect(propose([{ from: outsider, to: admin, couple: e }])).rejects.toThrow(/no longer in the league/);
    await expect(propose([{ from: friend, to: admin, couple: e }, { from: friend, to: third, couple: e }])).rejects.toThrow(/only move once/);
    await expect(propose([{ from: friend, to: admin, couple: e }, { from: admin, to: friend, points: 1 }, { from: admin, to: friend, points: 1 }]))
      .rejects.toThrow(/one amount/);
    await expect(propose([{ from: admin, to: admin, couple: a }])).rejects.toThrow(/not valid/);
    await expect(propose([{ from: friend, to: admin, couple: e }, { from: admin, to: friend, points: 0.005 }])).rejects.toThrow(/not valid/);
    // Ten percent of what Admin has earned, and not a hundredth more.
    await expect(propose([{ from: friend, to: admin, couple: e }, { from: admin, to: friend, points: adminCash + 0.01 }]))
      .rejects.toThrow(/at most 10%/);
    // Third's two couples are both still dancing.
    await asUser(third);
    await expect(propose([{ from: friend, to: third, couple: e }])).rejects.toThrow(/no roster spot/);
    await asService();
    expect(await visibleOffers()).toEqual([]);
  });

  it("keeps an offer between its managers until they have all accepted", async () => {
    await asUser(partner);
    const first = await propose([{ from: friend, to: admin, couple: e }, { from: admin, to: friend, points: 1 }]);
    expect((await db.query("select proposed_by, submitted_by from public.trade_offers")).rows).toEqual([{ proposed_by: friend, submitted_by: partner }]);
    await asUser(friend);
    expect(await visibleOffers()).toEqual([first]);
    await asUser(third);
    expect(await visibleOffers()).toEqual([]);
    expect((await db.query("select 1 from public.trade_legs")).rows).toEqual([]);
    await expect(respond(first, true)).rejects.toThrow(/not part of this trade/);
    await asUser(admin);
    expect(await respond(first, false)).toBe("declined");
    await expect(respond(first, true)).rejects.toThrow(/no longer open/);

    const second = await propose([{ from: friend, to: admin, couple: e }]);
    expect(await respond(second, false)).toBe("cancelled");
    await asUser(third);
    expect(await visibleOffers()).toEqual([]);
  });

  it("gives the teams outside an accepted trade 24 hours to veto it by majority", async () => {
    await asUser(admin);
    const vetoed = await propose([{ from: admin, to: third, couple: a }, { from: third, to: admin, couple: c }]);
    await asUser(third);
    expect(await respond(vetoed, true)).toBe("accepted");
    expect((await db.query("select round(extract(epoch from veto_ends_at - accepted_at) / 3600)::int as hours from public.trade_offers where id = $1", [vetoed])).rows)
      .toEqual([{ hours: 24 }]);
    await expect(veto(vetoed)).rejects.toThrow(/can't veto a trade you are part of/);
    // Two teams are outside it, so one vote isn't a majority, however many
    // of that team's managers cast it.
    await asUser(fourth);
    expect(await visibleOffers()).toEqual([vetoed]);
    await asUser(partner);
    expect(await veto(vetoed)).toBe("accepted");
    await asUser(friend);
    expect(await veto(vetoed)).toBe("accepted");
    await asUser(fourth);
    expect(await veto(vetoed)).toBe("vetoed");
    await expect(veto(vetoed)).rejects.toThrow(/veto window for this trade has closed/);

    // A vote leaves with its team. With a fifth team three are outside the
    // trade; once that team has voted and left, the two that remain still
    // both have to vote.
    await asService();
    await db.query("insert into public.league_members(league_id, user_id, role) values ($1, $2, 'manager')", [league, outsider]);
    await asUser(admin);
    const again = await propose([{ from: admin, to: third, couple: a }, { from: third, to: admin, couple: c }]);
    await asUser(third);
    expect(await respond(again, true)).toBe("accepted");
    await asUser(outsider);
    expect(await veto(again)).toBe("accepted");
    await asService();
    await db.query("delete from public.league_members where league_id = $1 and user_id = $2", [league, outsider]);
    await asUser(friend);
    expect(await veto(again)).toBe("accepted");
    await asUser(fourth);
    expect(await veto(again)).toBe("vetoed");
  });

  it("holds a couple for whichever came first, a waiver claim or a trade", async () => {
    // Trades keep Week 9's run alive once it is due, but claims can't join
    // it when Recast is turned on after that.
    await asService();
    await aired(e10, 49);
    await db.query("update public.leagues set waiver_mode = 'waivers' where id = $1", [league]);
    await asUser(fourth);
    await expect(saveList([{ couple: j, slot: 2, drop: h }])).rejects.toThrow(/run that is already due/);
    await asService();
    await db.query("update public.leagues set waiver_mode = 'locked' where id = $1", [league]);
    await aired(e10, 47);

    await db.query("update public.leagues set waiver_mode = 'waivers' where id = $1", [league]);
    await asUser(fourth);
    await saveList([{ couple: j, slot: 2, drop: h }]);
    await asUser(admin);
    await expect(propose([{ from: fourth, to: admin, couple: h }])).rejects.toThrow(/pending waiver claim/);
    await asUser(fourth);
    await saveList([]);

    // Admin spends every point they can on E, for their open spot.
    await asUser(admin);
    cashTrade = await propose([{ from: friend, to: admin, couple: e }, { from: admin, to: friend, points: adminCash }]);
    await asUser(friend);
    await expect(saveList([{ couple: i, slot: 2, drop: e }])).rejects.toThrow(/in a trade that hasn't been settled/);
    expect(await respond(cashTrade, true)).toBe("accepted");

    // An accepted trade holds its couples and its points against other offers.
    await asUser(third);
    await expect(propose([{ from: friend, to: third, couple: e }, { from: third, to: friend, couple: c }])).rejects.toThrow(/already in a trade waiting/);
    await asUser(admin);
    expect(await cashAvailable()).toBe(0);
    await expect(propose([{ from: fourth, to: admin, couple: d }, { from: admin, to: fourth, couple: a }, { from: admin, to: fourth, points: 0.01 }]))
      .rejects.toThrow(/at most 10%/);
  });

  it("carries out cleared trades at the waiver run, before any claim", async () => {
    // Three teams, each passing a couple on, with points on one leg.
    await asUser(third);
    threeWay = await propose([
      { from: third, to: fourth, couple: b }, { from: fourth, to: friend, couple: d }, { from: friend, to: third, couple: g },
      { from: fourth, to: third, points: 0.5 },
    ]);
    await asUser(fourth);
    expect(await respond(threeWay, true)).toBe("proposed");
    await asUser(partner);
    expect(await respond(threeWay, true)).toBe("accepted");
    await asUser(admin);
    swap = await propose([{ from: admin, to: third, couple: a }, { from: third, to: admin, couple: c }]);
    await asUser(third);
    expect(await respond(swap, true)).toBe("accepted");

    await asService();
    await db.query("select public.enable_lifeline($1, $2, 10, '[]')", [league, admin]);
    await asUser(admin);
    await db.query("select public.set_lifeline_pick($1, $2, 2, $3)", [league, week10, b]);
    await asUser(friend);
    const friendCash = await cashAvailable();

    await asService();
    await vetoWindowOver(cashTrade, threeWay);
    await aired(e10, 49);
    expect(await processDue()).toEqual([{ league_id: league, week: 9, awards: 0 }]);
    expect((await db.query("select week_number, start_week, awards, trades from public.recast_cycles")).rows)
      .toEqual([{ week_number: 9, start_week: 10, awards: 0, trades: 2 }]);

    // E fills Admin's open spot; giving E away leaves Friend's second spot
    // empty. Every other couple lands in the spot its new manager gave up.
    expect(await roster(admin)).toEqual([
      { slot: 1, couple_id: a, source: "draft", start: 1, end: null },
      { slot: 2, couple_id: f, source: "draft", start: 1, end: 9 }, { slot: 2, couple_id: e, source: "trade", start: 10, end: null },
    ]);
    expect(await roster(friend)).toEqual([
      { slot: 1, couple_id: g, source: "draft", start: 1, end: 9 }, { slot: 1, couple_id: d, source: "trade", start: 10, end: null },
      { slot: 2, couple_id: e, source: "draft", start: 1, end: 9 },
    ]);
    expect(await roster(third)).toEqual([
      { slot: 1, couple_id: b, source: "draft", start: 1, end: 9 }, { slot: 1, couple_id: g, source: "trade", start: 10, end: null },
      { slot: 2, couple_id: c, source: "draft", start: 1, end: null },
    ]);
    expect(await roster(fourth)).toEqual([
      { slot: 1, couple_id: d, source: "draft", start: 1, end: 9 }, { slot: 1, couple_id: b, source: "trade", start: 10, end: null },
      { slot: 2, couple_id: h, source: "draft", start: 1, end: null },
    ]);
    expect(await offer(cashTrade)).toEqual({ status: "executed", result: null, week: 9, start: 10 });
    expect(await offer(threeWay)).toEqual({ status: "executed", result: null, week: 9, start: 10 });
    // Its veto window was still open, so it waits for the next run.
    expect(await offer(swap)).toEqual({ status: "accepted", result: null, week: null, start: null });

    // Points land on the latest published week and add up to nothing.
    expect(await transfers(week9)).toEqual({ [admin]: -adminCash, [friend]: adminCash, [third]: 0.5, [fourth]: -0.5 });
    expect(await transfers(week8)).toEqual({ [admin]: 0, [friend]: 0, [third]: 0, [fourth]: 0 });
    // The spot E filled loses the Lifeline it carried into Week 10.
    expect((await db.query("select 1 from public.lifeline_picks")).rows).toEqual([]);

    // Points received aren't points earned: they don't raise what Friend can send.
    await asUser(friend);
    expect(await cashAvailable()).toBe(friendCash);
    await asUser(admin);
    expect(await cashAvailable()).toBe(0);
    await asUser(outsider);
    expect(await visibleOffers()).toEqual([]);
    expect((await db.query("select public.trade_cash_available($1) as room", [league])).rows).toEqual([{ room: null }]);
  });

  it("lets an offer lapse when not everyone accepts within 48 hours", async () => {
    await asUser(admin);
    stale = await propose([{ from: admin, to: friend, couple: e }]);
    expect((await db.query("select round(extract(epoch from expires_at - created_at) / 3600)::int as hours from public.trade_offers where id = $1", [stale])).rows)
      .toEqual([{ hours: 48 }]);
    await expect(saveList([{ couple: j, slot: 2, drop: e }])).rejects.toThrow(/in a trade that hasn't been settled/);
    await asService();
    await db.query("update public.trade_offers set expires_at = now() - interval '1 minute' where id = $1", [stale]);
    await asUser(friend);
    await expect(respond(stale, true)).rejects.toThrow(/offer has expired/);
    // It stops holding its couple at once; the next run marks it expired.
    await asUser(admin);
    await saveList([{ couple: j, slot: 2, drop: e }]);
    await saveList([]);
    expect((await offer(stale)).status).toBe("proposed");
  });

  it("fails a trade whole when a couple in it goes home, and lets Recast fill an emptied spot", async () => {
    await asUser(friend);
    const doomed = await propose([{ from: fourth, to: friend, couple: h }, { from: friend, to: fourth, points: 0.5 }]);
    await saveList([{ couple: i, slot: 2 }]);
    await asUser(fourth);
    expect(await respond(doomed, true)).toBe("accepted");

    await asService();
    await saveNight(e11, [a, b, c, d, e, g, i, j], [h]);
    await finishWeek(e11);
    // Week 10 pays whoever held the couple that week: Admin and Third two
    // couples each, Friend only D.
    const points = Object.fromEntries(
      (await db.query<{ manager_id: string; points: number }>(
        "select manager_id, roster_points::float as points from public.weekly_manager_scores where league_id = $1 and week_id = $2", [league, week10])).rows
        .map((row) => [row.manager_id, row.points])
    );
    expect(points[admin]).toBe(points[third]);
    expect(points[friend]).toBeCloseTo(points[admin] / 2, 2);

    await vetoWindowOver(swap, doomed);
    await aired(e11, 49);
    expect(await processDue()).toEqual([{ league_id: league, week: 10, awards: 1 }]);
    expect(await offer(doomed)).toEqual({ status: "failed", result: "not_dancing", week: 10, start: null });
    expect(await offer(swap)).toEqual({ status: "executed", result: null, week: 10, start: 11 });
    expect((await offer(stale)).status).toBe("expired");
    expect(await transfers(week10)).toEqual({ [admin]: 0, [friend]: 0, [third]: 0, [fourth]: 0 });
    expect((await roster(admin)).filter((row) => row.slot === 1)).toEqual([
      { slot: 1, couple_id: a, source: "draft", start: 1, end: 10 }, { slot: 1, couple_id: c, source: "trade", start: 11, end: null },
    ]);
    expect((await roster(third)).filter((row) => row.slot === 2)).toEqual([
      { slot: 2, couple_id: c, source: "draft", start: 1, end: 10 }, { slot: 2, couple_id: a, source: "trade", start: 11, end: null },
    ]);
    expect((await roster(friend)).filter((row) => row.slot === 2)).toEqual([
      { slot: 2, couple_id: e, source: "draft", start: 1, end: 9 }, { slot: 2, couple_id: i, source: "waiver", start: 11, end: null },
    ]);

    // The league reads what happened to an accepted trade, failed or not.
    await asUser(third);
    expect(await visibleOffers()).toHaveLength(6);
  });

  it("close when Trades are turned off, and at the Semi-Finals lock", async () => {
    await asUser(admin);
    const calledOff = await propose([{ from: admin, to: fourth, couple: e }]);
    await db.query("select public.set_trades_enabled($1, false)", [league]);
    expect((await offer(calledOff)).status).toBe("cancelled");
    await expect(propose([{ from: admin, to: fourth, couple: e }])).rejects.toThrow(/does not use Trades/);
    await db.query("select public.set_trades_enabled($1, true)", [league]);
    await asService();
    await tradesOnAWhile();

    await asUser(admin);
    const late = await propose([{ from: admin, to: fourth, couple: e }]);
    await asService();
    await aired(e12, 1);
    await asUser(fourth);
    await expect(respond(late, true)).rejects.toThrow(/trade deadline has passed/);
    await expect(propose([{ from: admin, to: fourth, couple: e }])).rejects.toThrow(/trade deadline has passed/);

    await asService();
    await aired(e12, 73);
    expect(await processDue()).toEqual([{ league_id: league, week: 11, awards: 0 }]);
    expect((await offer(late)).status).toBe("expired");
    expect((await roster(admin)).at(-1)).toEqual({ slot: 2, couple_id: e, source: "trade", start: 10, end: null });
  });
});
