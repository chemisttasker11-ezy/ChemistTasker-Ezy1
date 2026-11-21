/** Poster-facing escalation audiences. Shared by Shift Centre web and Expo; icons belong to each host. */
export type ShiftAudienceKey =
  | 'FULL_PART_TIME'
  | 'LOCUM_CASUAL'
  | 'OWNER_CHAIN'
  | 'ORG_CHAIN'
  | 'PLATFORM';

export type ShiftAudienceLevel = Readonly<{
  key: ShiftAudienceKey;
  label: string;
  reach: string;
  scope: 'internal' | 'platform';
  requiresOrganization?: boolean;
}>;

/** Ascending notification reach; do not change the ordering without a server policy decision. */
export const SHIFT_AUDIENCE_LEVELS: readonly ShiftAudienceLevel[] = [
  { key: 'FULL_PART_TIME', label: 'My Pharmacy', reach: 'your full-time and part-time team', scope: 'internal' },
  { key: 'LOCUM_CASUAL', label: 'Favourites', reach: 'your favourite locums and casuals', scope: 'internal' },
  { key: 'OWNER_CHAIN', label: 'Chain', reach: 'staff across your other pharmacies', scope: 'internal' },
  { key: 'ORG_CHAIN', label: 'Organization', reach: 'members of your organisation', scope: 'internal', requiresOrganization: true },
  { key: 'PLATFORM', label: 'ChemistTasker', reach: 'verified professionals across ChemistTasker', scope: 'platform' },
];

export function getShiftAudienceLevel(key: unknown): ShiftAudienceLevel | undefined {
  return SHIFT_AUDIENCE_LEVELS.find((level) => level.key === key);
}
