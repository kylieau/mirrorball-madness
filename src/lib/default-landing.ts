// Where a signed-in user lands after login/root visit. /today owns the
// "does this person actually have any leagues" check itself (redirecting to
// /leagues, which renders the zero-state, when they don't) — this stays a
// single trivial redirect rather than duplicating that query here too.
export function getDefaultLandingPath(): string {
  return "/today";
}
