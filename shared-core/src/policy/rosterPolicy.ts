export type RosterMemberLike = {
  id?: number | string | null;
  user?: number | string | { id?: number | string | null; firstName?: string; first_name?: string; lastName?: string; last_name?: string; email?: string | null } | null;
  userId?: number | string | null;
  user_id?: number | string | null;
  userDetails?: { id?: number | string | null; firstName?: string; lastName?: string; displayName?: string; email?: string | null } | null;
  userDetail?: { id?: number | string | null; firstName?: string; lastName?: string; email?: string | null } | null;
  user_detail?: { id?: number | string | null; first_name?: string; last_name?: string; email?: string | null } | null;
  role?: string | null;
  userRole?: string | null;
  user_role?: string | null;
  isActive?: boolean | null;
  is_active?: boolean | null;
  invitedName?: string | null;
  invited_name?: string | null;
  name?: string | null;
  email?: string | null;
};

function normalizeRole(value: unknown): string {
  return String(value ?? '').trim().replace(/-/g, '_').toUpperCase();
}

export function rosterMemberUserId(member: RosterMemberLike): number {
  const nestedUser = typeof member?.user === 'object' && member.user ? member.user.id : member?.user;
  const raw =
    member?.userId ??
    member?.user_id ??
    member?.userDetails?.id ??
    member?.userDetail?.id ??
    member?.user_detail?.id ??
    nestedUser ??
    0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

export function rosterMemberRole(member: RosterMemberLike): string {
  return normalizeRole(member?.role ?? member?.userRole ?? member?.user_role ?? '');
}

export function rosterMemberIsActive(member: RosterMemberLike): boolean {
  return member?.isActive !== false && member?.is_active !== false;
}

export function rosterMemberLabel(member: RosterMemberLike): string {
  const detail =
    member?.userDetails ??
    member?.userDetail ??
    member?.user_detail ??
    (typeof member?.user === 'object' ? member.user : null) ??
    {};
  const first = (detail as any)?.firstName ?? (detail as any)?.first_name ?? '';
  const last = (detail as any)?.lastName ?? (detail as any)?.last_name ?? '';
  const full = [first, last].filter(Boolean).join(' ').trim();
  const email =
    (detail as any)?.email ??
    member?.email ??
    null;
  return (
    full ||
    (detail as any)?.displayName ||
    member?.name ||
    email ||
    member?.invitedName ||
    member?.invited_name ||
    `Worker #${rosterMemberUserId(member)}`
  );
}

export function isRosterMemberEligibleForRole(
  member: RosterMemberLike,
  requiredRole?: string | null,
  options: { excludeUserId?: number | null } = {},
): boolean {
  const userId = rosterMemberUserId(member);
  if (!userId || !rosterMemberIsActive(member)) return false;
  if (options.excludeUserId && userId === options.excludeUserId) return false;

  const required = normalizeRole(requiredRole);
  if (!required) return true;

  const actual = rosterMemberRole(member);
  // When the API omits a specific membership role, keep the candidate visible
  // and let the server perform final assignment validation. Do not infer a
  // portal role (for example OTHER_STAFF) into a pharmacy job role.
  return !actual || actual === required;
}
