import { describe, expect, it } from 'vitest';
import {
  isRosterMemberEligibleForRole,
  rosterMemberLabel,
  rosterMemberUserId,
} from './rosterPolicy';

describe('roster member policy', () => {
  it('normalizes user id and label from mapped membership shape', () => {
    const member = {
      user: 44,
      userDetails: { firstName: 'Sam', lastName: 'Taylor', email: 'sam@example.com' },
      role: 'PHARMACIST',
      isActive: true,
    };
    expect(rosterMemberUserId(member)).toBe(44);
    expect(rosterMemberLabel(member)).toBe('Sam Taylor');
  });

  it('requires exact pharmacy role without inferring OTHER_STAFF', () => {
    expect(isRosterMemberEligibleForRole({ user: 1, role: 'ASSISTANT', isActive: true }, 'ASSISTANT')).toBe(true);
    expect(isRosterMemberEligibleForRole({ user: 2, role: 'OTHER_STAFF', isActive: true }, 'ASSISTANT')).toBe(false);
  });

  it('rejects inactive or excluded members', () => {
    expect(isRosterMemberEligibleForRole({ user: 3, role: 'PHARMACIST', isActive: false }, 'PHARMACIST')).toBe(false);
    expect(isRosterMemberEligibleForRole({ user: 4, role: 'PHARMACIST', isActive: true }, 'PHARMACIST', { excludeUserId: 4 })).toBe(false);
  });

  it('keeps members with omitted specific role visible for server validation', () => {
    expect(isRosterMemberEligibleForRole({ user: 5, isActive: true }, 'PHARMACIST')).toBe(true);
  });
});
