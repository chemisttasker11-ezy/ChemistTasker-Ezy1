import {
  ALL_ADMIN_CAPABILITIES,
  type AdminCapability,
} from '../constants/capabilities';
import {
  ORG_ROLES,
  type AdminLevel,
} from '../constants/roles';
import type { PersonaMode } from '../constants/personas';

export const ORG_PORTAL_ROLES = [
  'ORGANIZATION',
  'ORG_OWNER',
  'ORG_STAFF',
  ...ORG_ROLES,
] as const;

const ORG_PORTAL_ROLE_SET = new Set<string>(ORG_PORTAL_ROLES);
export type AuthorityPharmacyRef = {
  id: number | string;
  name?: string | null;
};

export type AuthorityMembership = {
  pharmacy_id?: number | string | null;
  pharmacyId?: number | string | null;
  pharmacy?: AuthorityPharmacyRef | null;
  pharmacy_name?: string | null;
  employment_type?: string | null;
  employmentType?: string | null;
  organization_id?: number | string | null;
  organization_name?: string | null;
  region?: string | null;
  role?: string | null;
  admin_level?: string | null;
  pharmacies?: AuthorityPharmacyRef[];
  organization_pharmacies?: AuthorityPharmacyRef[];
  capabilities?: unknown[];
  staff_role?: string | null;
  job_title?: string | null;
  is_pharmacy_owner?: boolean;
};

export type AuthorityAdminAssignment = {
  id?: number | string | null;
  pharmacy_id?: number | string | null;
  pharmacyId?: number | string | null;
  pharmacy?: number | string | null;
  pharmacy_name?: string | null;
  pharmacyName?: string | null;
  admin_level?: string | null;
  capabilities?: unknown[];
  staff_role?: string | null;
  job_title?: string | null;
};

export type AuthorityUser = {
  id?: number | string | null;
  email?: string | null;
  username?: string | null;
  role?: string | null;
  memberships?: AuthorityMembership[] | null;
  admin_assignments?: AuthorityAdminAssignment[] | null;
  pharmacies?: AuthorityPharmacyRef[] | null;
  owner_pharmacies?: AuthorityPharmacyRef[] | null;
  owned_pharmacies?: AuthorityPharmacyRef[] | null;
};

const INTERNAL_PHARMACY_ROLES = new Set([
  'OWNER', 'PHARMACY_OWNER', 'MANAGER', 'PHARMACY_ADMIN', 'ADMIN',
  'ROSTER_MANAGER', 'COMMUNICATION_MANAGER',
]);
const STAFF_EMPLOYMENT_TYPES = new Set(['FULL_TIME', 'PART_TIME', 'CASUAL']);
const FAVORITE_STAFF_EMPLOYMENT_TYPES = new Set(['LOCUM', 'SHIFT_HERO']);

export type NormalizedAdminAssignment = {
  id?: number;
  pharmacy_id: number;
  pharmacy_name?: string | null;
  admin_level: AdminLevel;
  capabilities: AdminCapability[];
  staff_role?: string | null;
  job_title?: string | null;
};

function normalizeRole(value: unknown): string {
  return String(value ?? '').trim().replace(/-/g, '_').toUpperCase();
}

function normalizeAdminLevel(value: unknown): AdminLevel {
  const normalized = normalizeRole(value);
  if (normalized === 'OWNER') return 'OWNER';
  if (normalized === 'ROSTER_MANAGER') return 'ROSTER_MANAGER';
  if (normalized === 'COMMUNICATION_MANAGER') return 'COMMUNICATION_MANAGER';
  return 'MANAGER';
}

export function normalizeAdminCapability(value: unknown): AdminCapability | null {
  const normalized = normalizeRole(value);
  return ALL_ADMIN_CAPABILITIES.includes(normalized as AdminCapability)
    ? normalized as AdminCapability
    : null;
}

function numericPharmacyId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function membershipPharmacyId(membership: AuthorityMembership): number | null {
  return numericPharmacyId(
    membership.pharmacy_id ?? membership.pharmacyId ?? membership.pharmacy?.id,
  );
}

export function isInternalPharmacyMembership(membership?: AuthorityMembership | null): boolean {
  if (!membership || membershipPharmacyId(membership) == null) return false;
  const role = normalizeRole(membership.role);
  const employmentType = normalizeRole(membership.employment_type ?? membership.employmentType);
  return INTERNAL_PHARMACY_ROLES.has(role) ||
    STAFF_EMPLOYMENT_TYPES.has(employmentType) ||
    FAVORITE_STAFF_EMPLOYMENT_TYPES.has(employmentType);
}

export function hasFavoriteStaffMembership(user?: AuthorityUser | null): boolean {
  return (user?.memberships ?? []).some((membership) =>
    Boolean(
      membership &&
      membershipPharmacyId(membership) != null &&
      FAVORITE_STAFF_EMPLOYMENT_TYPES.has(
        normalizeRole(membership.employment_type ?? membership.employmentType),
      ),
    ),
  );
}

export function canAccessOrganizationPharmacies(membership?: AuthorityMembership | null): boolean {
  if (!membership || membership.organization_id == null) return false;
  const role = normalizeRole(membership.role);
  if (!ORG_ROLES.includes(role as (typeof ORG_ROLES)[number])) return false;
  if (role === 'ORG_ADMIN' && Array.isArray(membership.capabilities) &&
      membership.capabilities.some((capability) => normalizeRole(capability) === 'VIEW_ALL_PHARMACIES')) {
    return true;
  }
  return (membership.pharmacies ?? []).some((pharmacy) => numericPharmacyId(pharmacy?.id) != null);
}

export function hasInternalWorkspaceAccess(user?: AuthorityUser | null): boolean {
  if (!user) return false;
  if ((user.memberships ?? []).some(isInternalPharmacyMembership)) return true;
  if ((user.memberships ?? []).some(canAccessOrganizationPharmacies)) return true;
  if (normalizeAdminAssignments(user).length > 0) return true;
  return [user.pharmacies, user.owner_pharmacies, user.owned_pharmacies]
    .some((pharmacies) => pharmacies?.some((pharmacy) => numericPharmacyId(pharmacy?.id) != null));
}

export function hasOrganizationAccess(user?: AuthorityUser | null): boolean {
  if (!user) return false;
  if (ORG_PORTAL_ROLE_SET.has(normalizeRole(user.role))) return true;
  return getOrganizationMembership(user) != null;
}

export function canDelegateOrganizationRole(actorRole: string | null | undefined, targetRole: string): boolean {
  const actor = normalizeRole(actorRole);
  const target = normalizeRole(targetRole);
  if (actor === 'REGION_ADMIN') return target === 'REGION_ADMIN';
  if (actor === 'CHIEF_ADMIN') return target === 'CHIEF_ADMIN' || target === 'REGION_ADMIN';
  return true;
}

export function canDelegateOrganizationAdminLevel(
  actorLevel: string | null | undefined,
  targetLevel: string,
  levels: Record<string, { capabilities?: string[] }>,
): boolean {
  const actor = levels[normalizeRole(actorLevel)];
  const target = levels[normalizeRole(targetLevel)];
  if (!actor || !target) return false;
  const actorCapabilities = new Set(actor.capabilities ?? []);
  return (target.capabilities ?? []).every((capability) => actorCapabilities.has(capability));
}

export function canManageOrganizationMember(
  actor: AuthorityMembership | null | undefined,
  target: AuthorityMembership | null | undefined,
  levels: Record<string, { capabilities?: string[] }>,
): boolean {
  if (!actor || !target) return false;
  const actorRole = normalizeRole(actor.role);
  if (actorRole !== 'REGION_ADMIN' && actorRole !== 'CHIEF_ADMIN') return true;
  if (!canDelegateOrganizationRole(actor.role, target.role ?? '')) return false;
  if (!canDelegateOrganizationAdminLevel(actor.admin_level, target.admin_level ?? '', levels)) return false;
  if (actorRole === 'REGION_ADMIN' &&
      (actor.region ?? '').trim().toLowerCase() !== (target.region ?? '').trim().toLowerCase()) return false;
  const actorIds = new Set((actor.pharmacies ?? []).map((pharmacy) => numericPharmacyId(pharmacy.id)));
  const targetIds = (target.pharmacies ?? []).map((pharmacy) => numericPharmacyId(pharmacy.id));
  return targetIds.length > 0 && targetIds.every((id) => id != null && actorIds.has(id));
}

export function getOrganizationMembership(user?: AuthorityUser | null): AuthorityMembership | null {
  return (user?.memberships ?? []).find((membership) =>
    membership &&
    membership.organization_id != null &&
    Number.isInteger(Number(membership.organization_id)) &&
    Number(membership.organization_id) > 0 &&
    ORG_ROLES.includes(normalizeRole(membership.role) as (typeof ORG_ROLES)[number]),
  ) ?? null;
}

export function getOwnedPharmacyIds(user?: AuthorityUser | null): number[] {
  if (!user) return [];
  const ids = new Set<number>();
  for (const membership of user.memberships ?? []) {
    const pharmacyId = numericPharmacyId(membership?.pharmacy_id);
    if (!pharmacyId) continue;
    const role = normalizeRole(membership?.role);
    if (
      role === 'OWNER' ||
      role === 'PHARMACY_OWNER' ||
      membership?.is_pharmacy_owner === true
    ) {
      ids.add(pharmacyId);
    }
  }
  return [...ids];
}

export function normalizeAdminAssignments(user?: AuthorityUser | null): NormalizedAdminAssignment[] {
  if (!user) return [];

  const assignments: NormalizedAdminAssignment[] = [];

  for (const raw of user.admin_assignments ?? []) {
    const pharmacyId = numericPharmacyId(raw?.pharmacy_id ?? raw?.pharmacyId ?? raw?.pharmacy);
    if (!pharmacyId) continue;
    const capabilities = (raw?.capabilities ?? [])
      .map(normalizeAdminCapability)
      .filter((value): value is AdminCapability => value !== null);
    const rawId = Number(raw?.id);
    const assignment: NormalizedAdminAssignment = {
      ...(Number.isFinite(rawId) ? { id: rawId } : {}),
      pharmacy_id: pharmacyId,
      pharmacy_name: raw?.pharmacy_name ?? raw?.pharmacyName ?? null,
      admin_level: normalizeAdminLevel(raw?.admin_level),
      capabilities,
      staff_role: raw?.staff_role ?? null,
      job_title: raw?.job_title ?? null,
    };
    assignments.push(assignment);
  }

  return assignments;
}

function orgMembershipHasCapability(
  membership: AuthorityMembership,
  capability: AdminCapability,
  pharmacyId?: number,
): boolean {
  if (membership.organization_id == null) return false;
  const capabilities = (membership.capabilities ?? [])
    .map(normalizeAdminCapability)
    .filter((value): value is AdminCapability => value !== null);
  if (!capabilities.includes(capability)) return false;
  if (pharmacyId == null) {
    return normalizeRole(membership.role) === 'ORG_ADMIN' ||
      (membership.pharmacies ?? []).some((pharmacy) => numericPharmacyId(pharmacy.id) != null);
  }
  if (normalizeRole(membership.role) === 'ORG_ADMIN') {
    return (membership.organization_pharmacies ?? []).some(
      (pharmacy) => numericPharmacyId(pharmacy.id) === pharmacyId,
    );
  }
  return (membership.pharmacies ?? []).some(
    (pharmacy) => numericPharmacyId(pharmacy.id) === pharmacyId,
  );
}

export function hasAdminCapability(
  user: AuthorityUser | null | undefined,
  capability: AdminCapability,
  options: {
    pharmacyId?: number | string | null;
    activeAdminAssignmentId?: number | string | null;
  } = {},
): boolean {
  if (!user) return false;

  const pharmacyWasRequested = options.pharmacyId != null && String(options.pharmacyId).trim() !== '';
  const requestedPharmacyId = numericPharmacyId(options.pharmacyId);
  if (pharmacyWasRequested && requestedPharmacyId == null) return false;
  const assignments = normalizeAdminAssignments(user);
  const ownedPharmacies = new Set(getOwnedPharmacyIds(user));
  const orgMemberships = (user.memberships ?? []).filter(
    (membership) => membership?.organization_id != null,
  );
  const orgHasCapability = orgMemberships.some((membership) =>
    orgMembershipHasCapability(
      membership,
      capability,
      requestedPharmacyId ?? undefined,
    ),
  );

  if (requestedPharmacyId != null) {
    if (ownedPharmacies.has(requestedPharmacyId)) return true;
    const matching = assignments.find(
      (assignment) => assignment.pharmacy_id === requestedPharmacyId,
    );
    return Boolean(matching?.capabilities.includes(capability) || orgHasCapability);
  }

  if (normalizeRole(user.role) === 'OWNER' && ownedPharmacies.size > 0) return true;
  if (ownedPharmacies.size > 0 || orgHasCapability) return true;

  const activeId = Number(options.activeAdminAssignmentId);
  if (Number.isFinite(activeId)) {
    const active = assignments.find((assignment) => assignment.id === activeId);
    if (active) return active.capabilities.includes(capability);
  }

  return assignments.some((assignment) => assignment.capabilities.includes(capability));
}

/** Match the backend's kiosk manager scope for client controls. */
export function canManageKioskDevices(user: AuthorityUser | null | undefined, pharmacyId: number): boolean {
  const id = numericPharmacyId(pharmacyId);
  if (!user || id == null) return false;
  if (getOwnedPharmacyIds(user).includes(id)) return true;
  if (normalizeAdminAssignments(user).some((assignment) =>
    assignment.pharmacy_id === id &&
    (assignment.admin_level === 'OWNER' || assignment.admin_level === 'MANAGER')
  )) return true;

  return (user.memberships ?? []).some((membership) => {
    if (!membership?.organization_id) return false;
    const role = normalizeRole(membership.role);
    if (role === 'ORG_ADMIN') {
      return (membership.organization_pharmacies ?? []).some((pharmacy) => numericPharmacyId(pharmacy.id) === id);
    }
    if ((role === 'CHIEF_ADMIN' || role === 'REGION_ADMIN') &&
        ['OWNER', 'MANAGER'].includes(normalizeAdminLevel(membership.admin_level))) {
      return (membership.pharmacies ?? []).some((pharmacy) => numericPharmacyId(pharmacy.id) === id) &&
        (membership.organization_pharmacies ?? []).some((pharmacy) => numericPharmacyId(pharmacy.id) === id);
    }
    return false;
  });
}

export function resolveAdminPersonaAssignmentId(
  user: AuthorityUser | null | undefined,
  preferredAssignmentId?: number | string | null,
): number | null {
  if (!user || normalizeRole(user.role) === 'OWNER') return null;

  const assignments = normalizeAdminAssignments(user);
  const preferredId = Number(preferredAssignmentId);
  if (Number.isFinite(preferredId)) {
    const preferred = assignments.find((assignment) => assignment.id === preferredId);
    if (preferred?.id != null) return preferred.id;
  }

  return assignments.find((assignment) => assignment.id != null)?.id ?? null;
}

export type ResolvedPersonaSelection = {
  mode: PersonaMode;
  assignmentId: number | null;
};

export function resolvePersonaSelection(
  user: AuthorityUser | null | undefined,
  storedSelection?: string | null,
): ResolvedPersonaSelection {
  if (!user || normalizeRole(user.role) === 'OWNER') {
    return { mode: 'staff', assignmentId: null };
  }

  const assignments = normalizeAdminAssignments(user);
  if (storedSelection?.startsWith('ADMIN:')) {
    const id = Number(storedSelection.split(':')[1]);
    const match = assignments.find((assignment) => assignment.id === id);
    if (match?.id != null) return { mode: 'admin', assignmentId: match.id };
  }

  if (storedSelection?.startsWith('ROLE:')) {
    const selectedRole = normalizeRole(storedSelection.split(':')[1]);
    const baseRole = normalizeRole(user.role);
    if (
      selectedRole === baseRole &&
      (baseRole === 'PHARMACIST' || baseRole === 'OTHER_STAFF')
    ) {
      return { mode: 'staff', assignmentId: null };
    }
  }

  return { mode: 'staff', assignmentId: null };
}
