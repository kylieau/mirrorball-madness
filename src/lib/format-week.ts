export function formatEpisodeLabel(episodeNumber: number, seasonNumber?: number | null): string {
  const episodePart = `E${String(episodeNumber).padStart(2, "0")}`;
  return seasonNumber != null ? `S${seasonNumber}${episodePart}` : episodePart;
}
