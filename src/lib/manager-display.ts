export function formatManagerName({
  displayName,
  coManagerDisplayName,
}: {
  displayName: string;
  coManagerDisplayName?: string | null;
}): string {
  return coManagerDisplayName ? `${displayName} & ${coManagerDisplayName}` : displayName;
}
