import { describe, expect, it } from 'vitest';
import {
  hasAdminCapability,
  hasOrganizationAccess,
  normalizeAdminAssignments,
  resolveAdminPersonaAssignmentId,
  resolvePersonaSelection,
} from './accessPolicy';

describe('shared access policy', () => {
  it('grants owners full capability without synthesizing admin persona', () => {
    const user = {
      id: 1,
      role: 'OWNER',
      memberships: [{ pharmacy_id: 10, role: 'OWNER' }],
    };

    expect(hasAdminCapability(user, 'MANAGE_STAFF', { pharmacyId: 10 })).toBe(true);
    expect(resolvePersonaSelection(user, null)).toEqual({ mode: 'staff', assignmentId: null });
  });

  it('normalizes explicit admin assignments', () => {
    const user = {
      id: 2,
      role: 'PHARMACIST',
      admin_assignments: [{
        id: 44,
        pharmacy_id: 10,
        admin_level: 'ROSTER_MANAGER',
        capabilities: ['MANAGE_ROSTER'],
      }],
    };

    expect(normalizeAdminAssignments(user)).toEqual([
      expect.objectContaining({
        id: 44,
        pharmacy_id: 10,
        admin_level: 'ROSTER_MANAGER',
        capabilities: ['MANAGE_ROSTER'],
      }),
    ]);
    expect(hasAdminCapability(user, 'MANAGE_ROSTER', { pharmacyId: 10 })).toBe(true);
    expect(hasAdminCapability(user, 'MANAGE_STAFF', { pharmacyId: 10 })).toBe(false);
  });

  it('synthesizes admin authority from pharmacy membership like web', () => {
    const user = {
      id: 3,
      role: 'PHARMACIST',
      memberships: [{
        pharmacy_id: 21,
        pharmacy_name: 'Demo Pharmacy',
        role: 'MANAGER',
      }],
    };

    const assignments = normalizeAdminAssignments(user);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toEqual(expect.objectContaining({
      pharmacy_id: 21,
      pharmacy_name: 'Demo Pharmacy',
      admin_level: 'MANAGER',
    }));
    expect(assignments[0].capabilities).toContain('MANAGE_STAFF');
    expect(assignments[0].capabilities).toContain('MANAGE_ROSTER');
  });

  it('respects scoped organisation capabilities', () => {
    const user = {
      id: 4,
      role: 'PHARMACIST',
      memberships: [{
        organization_id: 7,
        role: 'REGION_ADMIN',
        capabilities: ['MANAGE_ROSTER'],
        pharmacies: [{ id: 31 }, { id: 32 }],
      }],
    };

    expect(hasOrganizationAccess(user)).toBe(true);
    expect(hasAdminCapability(user, 'MANAGE_ROSTER', { pharmacyId: 31 })).toBe(true);
    expect(hasAdminCapability(user, 'MANAGE_ROSTER', { pharmacyId: 99 })).toBe(false);
  });

  it('restores valid admin persona and falls back to first normalized assignment', () => {
    const user = {
      id: 5,
      role: 'OTHER_STAFF',
      admin_assignments: [
        { id: 8, pharmacy_id: 40, capabilities: ['MANAGE_STAFF'] },
        { id: 9, pharmacy_id: 41, capabilities: ['MANAGE_ROSTER'] },
      ],
    };

    expect(resolvePersonaSelection(user, 'ADMIN:9')).toEqual({ mode: 'admin', assignmentId: 9 });
    expect(resolvePersonaSelection(user, 'ADMIN:999')).toEqual({ mode: 'admin', assignmentId: 8 });
  });

  it('keeps multi-role staff, pharmacy admin and organisation authority distinct', () => {
    const user = {
      id: 7,
      role: 'PHARMACIST',
      admin_assignments: [{
        id: 70,
        pharmacy_id: 70,
        admin_level: 'ROSTER_MANAGER',
        capabilities: ['MANAGE_ROSTER'],
      }],
      memberships: [{
        organization_id: 9,
        role: 'REGION_ADMIN',
        capabilities: ['MANAGE_STAFF'],
        pharmacies: [{ id: 71 }],
      }],
    };

    expect(hasOrganizationAccess(user)).toBe(true);
    expect(hasAdminCapability(user, 'MANAGE_ROSTER', { pharmacyId: 70 })).toBe(true);
    expect(hasAdminCapability(user, 'MANAGE_STAFF', { pharmacyId: 70 })).toBe(false);
    expect(hasAdminCapability(user, 'MANAGE_STAFF', { pharmacyId: 71 })).toBe(true);
    expect(resolvePersonaSelection(user, 'ROLE:PHARMACIST')).toEqual({ mode: 'staff', assignmentId: null });
    expect(resolvePersonaSelection(user, 'ADMIN:70')).toEqual({ mode: 'admin', assignmentId: 70 });
  });

  it('resolves an explicit Admin switch independently of the active staff persona', () => {
    const user = {
      id: 8,
      role: 'PHARMACIST',
      admin_assignments: [
        { id: 12, pharmacy_id: 60, capabilities: ['MANAGE_STAFF'] },
        { id: 13, pharmacy_id: 61, capabilities: ['MANAGE_ROSTER'] },
      ],
    };

    expect(resolvePersonaSelection(user, 'ROLE:PHARMACIST')).toEqual({ mode: 'staff', assignmentId: null });
    expect(resolveAdminPersonaAssignmentId(user)).toBe(12);
    expect(resolveAdminPersonaAssignmentId(user, 13)).toBe(13);
    expect(resolveAdminPersonaAssignmentId(user, 999)).toBe(12);
  });

  it('keeps a stored matching staff persona', () => {
    const user = {
      id: 6,
      role: 'PHARMACIST',
      admin_assignments: [{ id: 10, pharmacy_id: 50, capabilities: ['MANAGE_ROSTER'] }],
    };

    expect(resolvePersonaSelection(user, 'ROLE:PHARMACIST')).toEqual({ mode: 'staff', assignmentId: null });
  });
});
