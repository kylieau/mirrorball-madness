// Redirect targets come from client-controlled query parameters. Browsers
// normalize backslashes and control characters before resolving authority.
export function safeRelativePath(path: string | undefined, fallback: string): string {
  if (!path || !path.startsWith("/") || /[\\\u0000-\u0020\u007f]/.test(path)) return fallback;
  const origin = "https://relative-path.invalid";
  try {
    if (new URL(path, origin).origin !== origin) return fallback;
    return path;
  } catch {
    return fallback;
  }
}
