// The one canonical order the three scoring modules are listed in anywhere
// they're shown together (Your Picks, Standings, Settings, create-league).
// Curtain Call leads because it's the weekly, actionable module; Dance Card
// is mostly a passive roster after the draft; Grand Finale is a one-time
// pick that locks around Week 1. Derive any new module list from this.
export const SCORING_MODULES = [
  { key: "curtainCall", name: "Curtain Call", description: "Weekly Pick 'Em", icon: "🔮", createField: "curtainCallEnabled" },
  { key: "danceCard", name: "Dance Card", description: "Draft Fantasy", icon: "🪩", createField: "danceCardEnabled" },
  { key: "grandFinale", name: "Grand Finale", description: "Full-Order Prediction", icon: "🏆", createField: "grandFinaleEnabled" },
] as const;

export type ScoringModuleKey = (typeof SCORING_MODULES)[number]["key"];

export function scoringModule(key: ScoringModuleKey) {
  return SCORING_MODULES.find((m) => m.key === key)!;
}
