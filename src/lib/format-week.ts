// Official/admin copy includes the season because ops look across seasons.
// Fan tabs don't — players only ever see the active one — so those use the
// casual helpers below instead of this formatter.
export function formatEpisodeLabel(episodeNumber: number, seasonNumber?: number | null): string {
  const episodePart = `E${String(episodeNumber).padStart(2, "0")}`;
  return seasonNumber != null ? `S${seasonNumber} ${episodePart}` : episodePart;
}

// Fan-facing unit is a competition week (round), not a TV episode.
export function formatEpisodeCasual(weekNumber: number): string {
  return `Week ${weekNumber}`;
}

export function formatEpisodeCasualShort(weekNumber: number): string {
  return `Week ${weekNumber}`;
}

// The only genuinely-abbreviated variant — for tight inline spots (e.g. a
// couple's status tag) where "Week N" doesn't fit.
export function formatEpisodeCasualAbbreviated(weekNumber: number): string {
  return `Wk ${weekNumber}`;
}

export function formatEpisodeCasualWithTheme(weekNumber: number, theme?: string | null): string {
  const label = formatEpisodeCasualShort(weekNumber);
  const trimmed = theme?.trim();
  return trimmed ? `${label} — ${trimmed}` : label;
}

// Subtle multi-night hint for a week that groups 2+ TV airings.
export function formatNightsLabel(episodeThemes: (string | null | undefined)[]): string | null {
  if (episodeThemes.length < 2) return null;
  const labels = episodeThemes.map((theme) => theme?.trim()).filter((theme): theme is string => !!theme);
  if (labels.length >= 2) return labels.join(" + ");
  return `${episodeThemes.length} nights`;
}

// Admin Enter Results picker: Week N (and a night name when the week has
// 2+ airings). Never leads with S35 E0x — that's Schedule-only.
export function formatEnterResultsOption({
  weekNumber,
  nightsCount,
  episodeTheme,
  airsAt,
}: {
  weekNumber: number | null;
  nightsCount: number;
  episodeTheme: string | null;
  airsAt: string;
}): string {
  const date = new Date(airsAt).toLocaleDateString();
  const theme = episodeTheme?.trim() || null;
  if (weekNumber == null) {
    return theme ? `${theme} (exhibition) — ${date}` : `Exhibition — ${date}`;
  }
  const week = formatEpisodeCasual(weekNumber);
  if (nightsCount >= 2) {
    return theme ? `${week} · ${theme} — ${date}` : `${week} — ${date}`;
  }
  return theme ? `${week} — ${theme} — ${date}` : `${week} — ${date}`;
}
