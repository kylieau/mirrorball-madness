// A co-managed team is one league_members row shared by two auth users
// (user_id the primary, co_manager_id the co-manager). Every "is this me"
// comparison against a member/manager list needs to check both, or a
// co-manager sees themselves as a stranger to their own team.
export function findOwnMembership<T extends { user_id: string; co_manager_id: string | null }>(
  members: readonly T[],
  viewerId: string
): T | undefined {
  return members.find((m) => m.user_id === viewerId || m.co_manager_id === viewerId);
}

export function isOwnMembership(
  member: { user_id: string; co_manager_id: string | null },
  viewerId: string
): boolean {
  return member.user_id === viewerId || member.co_manager_id === viewerId;
}
