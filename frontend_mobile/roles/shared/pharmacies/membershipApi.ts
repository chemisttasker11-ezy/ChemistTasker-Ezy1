import { fetchMembershipsByPharmacy, type MembershipDTO } from '@chemisttasker/shared-core';

/**
 * Membership reads are owned by shared-core so Vite and mobile consume the
 * same endpoint, response mapping, and compatibility aliases.
 */
export async function fetchMembershipsForPharmacy(
  pharmacyId: string | number
): Promise<MembershipDTO[]> {
  return await fetchMembershipsByPharmacy(pharmacyId) as MembershipDTO[];
}


/** One classification for all owner and organization pharmacy staff/locum routes. */
export function isLocumMembership(membership: MembershipDTO): boolean {
  const row = membership as MembershipDTO & { employmentType?: string; employment_type?: string };
  const employment = String(row.employmentType ?? row.employment_type ?? '').toUpperCase();
  return employment === 'LOCUM' || employment === 'SHIFT_HERO';
}
