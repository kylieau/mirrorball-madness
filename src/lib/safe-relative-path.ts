// A "from" value arrives as a client-controlled query param, so it has to be
// validated before being used as a redirect target — "//evil.com" parses as
// protocol-relative and would otherwise send a user off the app.
export function safeRelativePath(path: string | undefined, fallback: string): string {
  if (path && path.startsWith("/") && !path.startsWith("//")) return path;
  return fallback;
}
