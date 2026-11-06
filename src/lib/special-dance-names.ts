// One rule for naming a special dance everywhere in the app (Kylie,
// 2026-11-06, docs/design/special-dance-names/): the short name is the
// dance's own name ("Slaytopia", "Dance-Off 2", "Dance-Off Immunity"), the
// full name puts its Dance Type in front unless the name already says it
// ("Team Dance · Slaytopia", "Dance-Off 2"). Error messages from SQL still
// use special_dance_label until that script is rewritten.
type Named = { name: string; danceType: string };

export function specialDanceShortName(dance: Named): string {
  return dance.name.trim() || dance.danceType.trim();
}

export function specialDanceFullName(dance: Named): string {
  const name = dance.name.trim();
  const type = dance.danceType.trim();
  if (!name || !type) return name || type;
  return name.toLowerCase().includes(type.toLowerCase()) ? name : `${type} · ${name}`;
}

// The Dance Type badge beside a short name, only when the name doesn't
// already say it.
export function specialDanceTypeBadge(dance: Named): string | null {
  const type = dance.danceType.trim();
  return type && specialDanceFullName(dance) !== specialDanceShortName(dance) ? type : null;
}
