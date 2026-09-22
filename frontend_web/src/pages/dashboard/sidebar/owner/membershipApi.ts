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
