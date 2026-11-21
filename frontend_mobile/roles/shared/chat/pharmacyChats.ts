/** Only currently active memberships can advertise a canonical team-chat entry. */
export function pharmacyChatsFromMemberships(memberships: Array<{
  pharmacyId?: number | string | null;
  pharmacyName?: string | null;
  pharmacyDetail?: { name?: string | null } | null;
  isActive?: boolean;
  is_active?: boolean;
  status?: string | null;
}>): Array<{ id: number; name: string }> {
  const items = new Map<number, { id: number; name: string }>();
  for (const membership of memberships) {
    const id = Number(membership.pharmacyId);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    if (membership.isActive === false || membership.is_active === false) continue;
    if (membership.status && !['ACCEPTED', 'ACTIVE'].includes(membership.status.toUpperCase())) continue;
    const name = String(membership.pharmacyName || membership.pharmacyDetail?.name || '').trim();
    if (!name) continue;
    items.set(id, { id, name });
  }
  return Array.from(items.values()).sort((a, b) => a.name.localeCompare(b.name));
}
