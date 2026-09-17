// Official/admin copy includes the season because ops look across seasons.
// Fan tabs don't — players only ever see the active one — so those use the
// casual helpers below instead of this formatter.
export function formatEpisodeLabel(episodeNumber: number, seasonNumber?: number | null): string {
  const episodePart = `E${String(episodeNumber).padStart(2, "0")}`;
  return seasonNumber != null ? `S${seasonNumber} ${episodePart}` : episodePart;
}

export function formatEpisodeCasual(episodeNumber: number): string {
  return `Episode ${episodeNumber}`;
}

export function formatEpisodeCasualShort(episodeNumber: number): string {
  return `Ep. ${episodeNumber}`;
}

export function formatEpisodeCasualWithTheme(episodeNumber: number, theme?: string | null): string {
  const label = formatEpisodeCasualShort(episodeNumber);
  const trimmed = theme?.trim();
  return trimmed ? `${label} — ${trimmed}` : label;
}
