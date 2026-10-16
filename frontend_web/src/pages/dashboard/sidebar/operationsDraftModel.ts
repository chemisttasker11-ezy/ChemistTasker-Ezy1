import type { OperationAudience } from '@chemisttasker/shared-core';

export const ROLE_OPTIONS = [
  { value: '', label: 'Any eligible pharmacy role' },
  { value: 'PHARMACIST', label: 'Pharmacist' },
  { value: 'INTERN', label: 'Intern' },
  { value: 'TECHNICIAN', label: 'Dispensary technician' },
  { value: 'ASSISTANT', label: 'Pharmacy assistant' },
  { value: 'STUDENT', label: 'Student' },
];
export const AUDIENCES: Array<{ value: OperationAudience; label: string; description: string }> = [
  { value: 'ROLE_ON_DUTY', label: 'Eligible role on shift', description: 'Match the published roster and chosen role' },
  { value: 'ON_DUTY', label: 'Working at this time', description: 'Use staff scheduled during the time window' },
  { value: 'TEAM_POOL', label: 'Shared team task', description: 'One authorised staff member can complete for the pool' },
  { value: 'EVERY_ON_DUTY', label: 'Every scheduled employee', description: 'Each assigned person must complete separately' },
  { value: 'NAMED', label: 'Named individual(s)', description: 'Directly choose active members; may be outside a shift for training' },
];
export type TaskDraft = {
  title: string; date: string; description: string; area: string; audience: OperationAudience;
  role: string; members: number[]; steps: string; startTime: string; endTime: string;
  requiresVerification: boolean; target: string; targetUnit: string;
  targetKind: 'operational' | 'clinical' | 'safety'; trainingUrl: string;
};
export const blankDraft = (day: string): TaskDraft => ({
  title: '', date: day, description: '', area: 'dispensary', audience: 'ROLE_ON_DUTY',
  role: '', members: [], steps: '', startTime: '', endTime: '',
  requiresVerification: false, target: '', targetUnit: '',
  targetKind: 'operational', trainingUrl: '',
});
export type Member = { id: number; role?: string; invitedName?: string; invited_name?: string; userDetails?: { firstName?: string; lastName?: string }; user_details?: { first_name?: string; last_name?: string } };
export function normalizeMembers(source: unknown): Member[] {
  if (Array.isArray(source)) return source as Member[];
  if (source && typeof source === 'object' && 'results' in source) {
    return ((source as { results?: unknown }).results ?? []) as Member[];
  }
  return [];
}
export function memberName(m: Member) {
  const details = m.userDetails ?? m.user_details;
  const name = m.invitedName || m.invited_name || [
    (details as { firstName?: string })?.firstName || (details as { first_name?: string })?.first_name,
    (details as { lastName?: string })?.lastName || (details as { last_name?: string })?.last_name,
  ].filter(Boolean).join(' ') || 'Member ' + m.id;
  return name + (m.role ? ' · ' + m.role : '');
}

