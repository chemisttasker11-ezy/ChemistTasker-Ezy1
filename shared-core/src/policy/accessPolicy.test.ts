import { describe, expect, it } from 'vitest';
import {
  hasAdminCapability,
  canAccessOrganizationPharmacies,
  canDelegateOrganizationAdminLevel,
  canDelegateOrganizationRole,
  canManageOrganizationMember,
  canManageKioskDevices,
  hasFavoriteStaffMembership,
  hasInternalWorkspaceAccess,
  hasOrganizationAccess,
  getOrganizationMembership,
  isInternalPharmacyMembership,
  normalizeAdminAssignments,
  resolveAdminPersonaAssignmentId,
  resolvePersonaSelection,
} from './accessPolicy';

describe('shared access policy', () => {
  it('limits Region delegation choices without reducing its own role capabilities', () => {
    const levels = {
      MANAGER: { capabilities: ['manage_admins', 'manage_staff', 'manage_roster', 'manage_communications'] },
      ROSTER_MANAGER: { capabilities: ['manage_roster', 'manage_communications'] },
      COMMUNICATION_MANAGER: { capabilities: ['manage_communications'] },
    };
    expect(canDelegateOrganizationRole('REGION_ADMIN', 'REGION_ADMIN')).toBe(true);
    expect(canDelegateOrganizationRole('REGION_ADMIN', 'CHIEF_ADMIN')).toBe(false);
    expect(canDelegateOrganizationRole('CHIEF_ADMIN', 'ORG_ADMIN')).toBe(false);
    expect(canDelegateOrganizationAdminLevel('ROSTER_MANAGER', 'COMMUNICATION_MANAGER', levels)).toBe(true);
    expect(canDelegateOrganizationAdminLevel('ROSTER_MANAGER', 'MANAGER', levels)).toBe(false);
    const actor = { role: 'REGION_ADMIN', admin_level: 'ROSTER_MANAGER', region: 'North', pharmacies: [{ id: 7 }] };
    expect(canManageOrganizationMember(actor, { ...actor, pharmacies: [{ id: 7 }] }, levels)).toBe(true);
    expect(canManageOrganizationMember(actor, { ...actor, pharmacies: [{ id: 8 }] }, levels)).toBe(false);
  });
  it('resolves organization portal access only from a real organization membership or role', () => {
    const staff = {
      role: 'PHARMACIST',
      memberships: [{ organization_id: 7, role: 'ORG_STAFF' }],
    };
    const admin = {
      role: 'PHARMACIST',
      memberships: [{ organization_id: 7, role: 'REGION_ADMIN' }],
    };

    expect(hasOrganizationAccess(staff)).toBe(false);
    expect(getOrganizationMembership(staff)).toBeNull();
    expect(hasOrganizationAccess(admin)).toBe(true);
    expect(getOrganizationMembership(admin)).toEqual(admin.memberships[0]);
    expect(hasOrganizationAccess({ role: 'PHARMACIST', memberships: [{ role: 'ORG_ADMIN' }] })).toBe(false);
  });

  it('uses valid pharmacy scope for internal and favourite-staff workspace access', () => {
    const owner = { role: 'OWNER', memberships: [{ pharmacy_id: 10, role: 'OWNER' }] };
    const locum = {
      role: 'PHARMACIST',
      memberships: [{ pharmacy_id: 20, role: 'PHARMACIST', employment_type: 'LOCUM' }],
    };
    const assignedAdmin = {
      role: 'PHARMACIST',
      admin_assignments: [{ id: 3, pharmacy_id: 30, capabilities: ['MANAGE_ROSTER'] }],
    };

    expect(hasInternalWorkspaceAccess(owner)).toBe(true);
    expect(hasInternalWorkspaceAccess(locum)).toBe(true);
    expect(hasFavoriteStaffMembership(locum)).toBe(true);
    expect(hasInternalWorkspaceAccess(assignedAdmin)).toBe(true);
    expect(hasInternalWorkspaceAccess({ role: 'OWNER', owner_pharmacies: [{ id: 40 }] })).toBe(true);
    expect(isInternalPharmacyMembership({ pharmacy_id: 0, role: 'OWNER' })).toBe(false);
    expect(hasInternalWorkspaceAccess({ role: 'OWNER', memberships: [{ pharmacy_id: null, role: 'OWNER' }] })).toBe(false);
    expect(hasFavoriteStaffMembership({ role: 'PHARMACIST', memberships: [{ pharmacy_id: null, employment_type: 'LOCUM' }] })).toBe(false);
    expect(hasInternalWorkspaceAccess({ role: 'ORG_ADMIN', memberships: [{ organization_id: 8, role: 'ORG_ADMIN' }] })).toBe(false);
    const scopedOrg = {
      role: 'PHARMACIST',
      memberships: [{ organization_id: 8, role: 'REGION_ADMIN', pharmacies: [{ id: 50 }] }],
    };
    expect(canAccessOrganizationPharmacies(scopedOrg.memberships[0])).toBe(true);
    expect(hasInternalWorkspaceAccess(scopedOrg)).toBe(true);
    expect(hasInternalWorkspaceAccess({
      role: 'ORG_ADMIN',
      memberships: [{ organization_id: 8, role: 'ORG_ADMIN', capabilities: ['view_all_pharmacies'] }],
    })).toBe(true);
    expect(canAccessOrganizationPharmacies({ organization_id: 8, role: 'ORG_STAFF', pharmacies: [{ id: 50 }] })).toBe(false);
  });

  it('grants owners full capability without synthesizing admin persona', () => {
    const user = {
      id: 1,
      role: 'OWNER',
      memberships: [{ pharmacy_id: 10, role: 'OWNER' }],
    };

    expect(hasAdminCapability(user, 'MANAGE_STAFF', { pharmacyId: 10 })).toBe(true);
    expect(hasAdminCapability(user, 'MANAGE_STAFF', { pharmacyId: 11 })).toBe(false);
    expect(hasAdminCapability(user, 'MANAGE_STAFF', { pharmacyId: 'not-a-pharmacy' })).toBe(false);
    expect(hasAdminCapability(user, 'MANAGE_STAFF')).toBe(true);
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

  it('does not infer admin capabilities from a pharmacy membership role', () => {
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
    expect(assignments).toHaveLength(0);
    expect(hasAdminCapability(user, 'MANAGE_STAFF', { pharmacyId: 21 })).toBe(false);
    expect(hasAdminCapability(user, 'MANAGE_ROSTER', { pharmacyId: 21 })).toBe(false);
  });

  it('respects the pharmacy scope returned for organisation capabilities', () => {
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
    expect(hasAdminCapability(user, 'MANAGE_ROSTER')).toBe(true);
  });

  it('does not report organization capability when a scoped admin has no visible pharmacies', () => {
    const user = {
      id: 42,
      role: 'ORG_ADMIN',
      memberships: [{
        organization_id: 8,
        role: 'REGION_ADMIN',
        capabilities: ['MANAGE_ROSTER'],
        pharmacies: [],
      }],
    };

    expect(hasAdminCapability(user, 'MANAGE_ROSTER')).toBe(false);
  });

  it('does not treat an unscoped ORG_ADMIN role as authority for an arbitrary pharmacy', () => {
    const user = {
      id: 41,
      role: 'ORG_ADMIN',
      memberships: [{
        organization_id: 7,
        role: 'ORG_ADMIN',
        capabilities: ['MANAGE_ROSTER'],
        pharmacies: [],
      }],
    };

    expect(hasAdminCapability(user, 'MANAGE_ROSTER', { pharmacyId: 99 })).toBe(false);
  });

  it('uses verified organization pharmacies for an Org Admin explicit pharmacy check', () => {
    const user = {
      role: 'ORG_ADMIN',
      memberships: [{
        organization_id: 7,
        role: 'ORG_ADMIN',
        capabilities: ['MANAGE_ROSTER'],
        pharmacies: [],
        organization_pharmacies: [{ id: 31 }, { id: 32 }],
      }],
    };
    expect(hasAdminCapability(user, 'MANAGE_ROSTER', { pharmacyId: 31 })).toBe(true);
    expect(hasAdminCapability(user, 'MANAGE_ROSTER', { pharmacyId: 99 })).toBe(false);
  });

  it('shows kiosk controls only within the backend manager scope', () => {
    const owner = { role: 'OWNER', memberships: [{ pharmacy_id: 10, role: 'OWNER' }] };
    expect(canManageKioskDevices(owner, 10)).toBe(true);
    expect(canManageKioskDevices(owner, 11)).toBe(false);
    const assigned = { admin_assignments: [{ pharmacy_id: 20, admin_level: 'ROSTER_MANAGER' }] };
    expect(canManageKioskDevices(assigned, 20)).toBe(false);
    const org = { memberships: [{
      organization_id: 7, role: 'ORG_ADMIN', admin_level: 'COMMUNICATION_MANAGER',
      organization_pharmacies: [{ id: 30 }],
    }] };
    expect(canManageKioskDevices(org, 30)).toBe(true);
    expect(canManageKioskDevices(org, 31)).toBe(false);
    const region = { memberships: [{
      organization_id: 7, role: 'REGION_ADMIN', admin_level: 'MANAGER',
      pharmacies: [{ id: 30 }], organization_pharmacies: [{ id: 30 }],
    }] };
    expect(canManageKioskDevices(region, 30)).toBe(true);
    expect(canManageKioskDevices(region, 31)).toBe(false);
    expect(canManageKioskDevices({ memberships: [{ ...region.memberships[0], pharmacies: [] }] }, 30)).toBe(false);
    expect(canManageKioskDevices({ memberships: [{ ...region.memberships[0], role: 'CHIEF_ADMIN', admin_level: 'OWNER' }] }, 30)).toBe(true);
    expect(canManageKioskDevices({ memberships: [{ ...region.memberships[0], admin_level: 'ROSTER_MANAGER' }] }, 30)).toBe(false);
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
    expect(resolvePersonaSelection(user, 'ADMIN:999')).toEqual({ mode: 'staff', assignmentId: null });
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
