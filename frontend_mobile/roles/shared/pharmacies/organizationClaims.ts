/** Client-side constraints only. Backend remains the authority for claim eligibility. */
export function validatePharmacyClaimEmail(raw: string): string | null {
  const email = raw.trim();
  if (!email) return 'Enter the pharmacy email address.';
  if (email.length > 254 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return 'Enter a valid pharmacy email address.';
  return null;
}

export function getActiveOrganizationId(user: unknown): number | null {
  const memberships = (user as { memberships?: unknown } | null)?.memberships;
  if (!Array.isArray(memberships)) return null;
  for (const item of memberships) {
    if (!item || typeof item !== 'object') continue;
    const membership = item as Record<string, unknown>;
    const role = String(membership.role ?? '').toUpperCase();
    if (!['ORG_ADMIN', 'ORG_OWNER', 'ORG_STAFF', 'CHIEF_ADMIN', 'REGION_ADMIN', 'ORGANIZATION'].includes(role)) continue;
    if (membership.is_active === false || membership.isActive === false) continue;
    const id = Number(membership.organization_id ?? membership.organizationId);
    if (Number.isSafeInteger(id) && id > 0) return id;
  }
  return null;
}
