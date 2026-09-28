// Post-login destination. `/` is the fan Home tab and owns the
// "does this person actually have any leagues" check itself (redirecting to
// /leagues, which renders the zero-state, when they don't) — this stays a
// single trivial path rather than duplicating that query here too.
export function getDefaultLandingPath(): string {
  return "/";
}
