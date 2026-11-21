/** Client-side constraints only. Backend remains the authority for claim eligibility. */
export function validatePharmacyClaimEmail(raw: string): string | null {
  const email = raw.trim();
  if (!email) return 'Enter the pharmacy email address.';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid pharmacy email address.';
  return null;
}

export type ClaimableOrganization = { id: number; label: string };

/** Only roles with server-side CLAIM_PHARMACY authority can submit a claim. */
export function getClaimableOrganizations(user: unknown): ClaimableOrganization[] {
  const memberships = (user as { memberships?: unknown } | null)?.memberships;
  if (!Array.isArray(memberships)) return [];
  const found = new Map<number, ClaimableOrganization>();
  for (const item of memberships) {
    if (!item || typeof item !== 'object') continue;
    const membership = item as Record<string, unknown>;
    if (membership.is_active === false || membership.isActive === false) continue;
    const role = String(membership.role ?? '').toUpperCase();
    if (role !== 'ORG_ADMIN' && role !== 'CHIEF_ADMIN') continue;
    const id = Number(membership.organization_id ?? membership.organizationId);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    const nested = membership.organization;
    const nestedName = nested && typeof nested === 'object'
      ? String((nested as Record<string, unknown>).name ?? '').trim() : '';
    const name = String(membership.organization_name ?? nestedName).trim();
    found.set(id, { id, label: name || `Organisation #${id}` });
  }
  return [...found.values()];
}

export function getActiveOrganizationId(user: unknown): number | null {
  return getClaimableOrganizations(user)[0]?.id ?? null;
}
