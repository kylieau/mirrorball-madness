import { describe, expect, it } from "vitest";
import { homeTransactions, type TransactionLeague } from "./home-transactions";

const alpha: TransactionLeague = { id: "alpha", name: "Alpha", myTeamId: "me", managerNames: { me: "Me", kim: "Kim", pat: "Pat" } };
const beta: TransactionLeague = { id: "beta", name: "Beta", myTeamId: "me", managerNames: { me: "Me", lee: "Lee" } };
const names: Record<string, string> = { a: "A & B", c: "C & D", e: "E & F" };
const coupleOf = (coupleId: string) => (names[coupleId] ? { coupleId, name: names[coupleId] } : null);
const couple = (coupleId: string) => ({ coupleId, name: names[coupleId] });

describe("homeTransactions", () => {
  it("puts a league's trades before its claims and names the viewer's team as you", () => {
    expect(
      homeTransactions({
        leagues: [alpha, beta],
        claims: [
          { leagueId: "alpha", managerId: "pat", coupleId: "e", dropCoupleId: "c", weekNumber: 9 },
          { leagueId: "alpha", managerId: "kim", coupleId: "c", dropCoupleId: null, weekNumber: 9 },
          { leagueId: "beta", managerId: "me", coupleId: "a", dropCoupleId: null, weekNumber: 8 },
        ],
        trades: [
          {
            leagueId: "alpha",
            weekNumber: 9,
            legs: [
              { fromManagerId: "kim", toManagerId: "me", coupleId: "a", points: null },
              { fromManagerId: "me", toManagerId: "kim", coupleId: null, points: 4 },
            ],
          },
        ],
        coupleOf,
      })
    ).toEqual([
      {
        weekNumber: 9,
        transaction: {
          kind: "trade",
          league: "Alpha",
          sides: [
            { manager: "Kim", couples: [couple("a")], points: 0 },
            { manager: "you", couples: [], points: 4 },
          ],
        },
      },
      { weekNumber: 9, transaction: { kind: "waiver", league: "Alpha", manager: "Kim", added: couple("c"), dropped: null } },
      { weekNumber: 9, transaction: { kind: "waiver", league: "Alpha", manager: "Pat", added: couple("e"), dropped: couple("c") } },
      { weekNumber: 8, transaction: { kind: "waiver", league: "Beta", manager: "You", added: couple("a"), dropped: null } },
    ]);
  });

  it("leaves out a move naming a couple it can't name", () => {
    expect(
      homeTransactions({
        leagues: [alpha],
        claims: [
          { leagueId: "alpha", managerId: "pat", coupleId: "gone", dropCoupleId: null, weekNumber: 9 },
          { leagueId: "alpha", managerId: "pat", coupleId: "a", dropCoupleId: "gone", weekNumber: 9 },
        ],
        trades: [
          { leagueId: "alpha", weekNumber: 9, legs: [{ fromManagerId: "kim", toManagerId: "me", coupleId: "gone", points: null }] },
        ],
        coupleOf,
      })
    ).toEqual([]);
  });
});
