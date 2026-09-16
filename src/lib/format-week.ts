export function formatEpisodeLabel(episodeNumber: number): string {
  return `E${String(episodeNumber).padStart(2, "0")}`;
}
