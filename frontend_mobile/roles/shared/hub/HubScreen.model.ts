import type { HubGroupMemberOption } from './types';

export type Scope =
  | { type: 'pharmacy'; id: number }
  | { type: 'organization'; id: number }
  | { type: 'group'; id: number }
  | { type: 'orgGroup'; id: number }
  | { type: 'platform'; id: string };

export type ViewSelection =
  | { type: 'pharmacy'; id: number }
  | { type: 'organization'; id: number }
  | { type: 'group'; id: number }
  | { type: 'orgGroup'; id: number }
  | { type: 'platform'; id: string }
  | null;

export type GroupFormState = {
  id?: number;
  name: string;
  description: string;
  memberIds: number[];
};

const STAFF_EMPLOYMENT_TYPES = new Set(['FULL_TIME', 'PART_TIME', 'CASUAL']);

export const filterPharmacyStaffMembers = (members: HubGroupMemberOption[]) =>
  members.filter((member: any) =>
    STAFF_EMPLOYMENT_TYPES.has(member?.employmentType || member?.employment_type || ''),
  );

const isEmailLike = (value?: string | null) => Boolean(value && value.includes('@'));

export const getMemberDisplayName = (member: any, fallback = 'Member') => {
  const firstLast =
    `${member?.firstName ?? member?.first_name ?? ''} ${member?.lastName ?? member?.last_name ?? ''}`.trim();
  const candidates = [
    member?.fullName,
    member?.full_name,
    firstLast,
    member?.invitedName,
    member?.invited_name,
    member?.username,
  ];
  for (const candidate of candidates) {
    const value = typeof candidate === 'string' ? candidate.trim() : '';
    if (value && !isEmailLike(value)) {
      return value;
    }
  }
  const id = member?.membershipId ?? member?.membership_id ?? member?.id;
  return id ? `${fallback} ${id}` : fallback;
};
