// Official/admin copy includes the season because ops look across seasons.
// Fan tabs don't — players only ever see the active one — so those use the
// casual helpers below instead of this formatter.
//
// Competition unit is a week (aka round), not a TV episode. Fan copy always
// says Week N / Week N — {theme}. Admin/ops keep S35 E02 via formatEpisodeLabel.
export function formatEpisodeLabel(episodeNumber: number, seasonNumber?: number | null): string {
  const episodePart = `E${String(episodeNumber).padStart(2, "0")}`;
  return seasonNumber != null ? `S${seasonNumber} ${episodePart}` : episodePart;
}

export function formatEpisodeCasual(weekNumber: number): string {
  return `Week ${weekNumber}`;
}

export function formatEpisodeCasualShort(weekNumber: number): string {
  return `Week ${weekNumber}`;
}

export function formatEpisodeCasualWithTheme(weekNumber: number, theme?: string | null): string {
  const label = formatEpisodeCasualShort(weekNumber);
  const trimmed = theme?.trim();
  return trimmed ? `${label} — ${trimmed}` : label;
}

// Exhibition / interview nights set episodes.is_scoring = false and drop off
// Results/Picks carousels. Missing/undefined is treated as scoring so older
// fixtures and pre-column rows stay on the competition timeline.
export function isScoringWeek(episode: { is_scoring?: boolean | null }): boolean {
  return episode.is_scoring !== false;
}
