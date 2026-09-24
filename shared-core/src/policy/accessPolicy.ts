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
const ADMIN_LIKE_PHARMACY_ROLES = new Set([
  'MANAGER',
  'PHARMACY_ADMIN',
  'ADMIN',
  'ROSTER_MANAGER',
  'COMMUNICATION_MANAGER',
]);

export type AuthorityPharmacyRef = {
  id: number | string;
  name?: string | null;
};

export type AuthorityMembership = {
  pharmacy_id?: number | string | null;
  pharmacy_name?: string | null;
  organization_id?: number | string | null;
  organization_name?: string | null;
  role?: string | null;
  admin_level?: string | null;
  pharmacies?: AuthorityPharmacyRef[];
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
};

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

export function hasOrganizationAccess(user?: AuthorityUser | null): boolean {
  if (!user) return false;
  if (ORG_PORTAL_ROLE_SET.has(normalizeRole(user.role))) return true;
  return (user.memberships ?? []).some((membership) =>
    Boolean(
      membership &&
      membership.organization_id != null &&
      ORG_PORTAL_ROLE_SET.has(normalizeRole(membership.role)),
    ),
  );
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
  const byPharmacy = new Map<number, NormalizedAdminAssignment>();

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
    byPharmacy.set(pharmacyId, assignment);
  }

  for (const membership of user.memberships ?? []) {
    const pharmacyId = numericPharmacyId(membership?.pharmacy_id);
    if (!pharmacyId || byPharmacy.has(pharmacyId)) continue;

    const role = normalizeRole(membership?.role);
    const isOwner =
      role === 'OWNER' ||
      role === 'PHARMACY_OWNER' ||
      membership?.is_pharmacy_owner === true;
    if (isOwner || !ADMIN_LIKE_PHARMACY_ROLES.has(role)) continue;

    const syntheticId = -Math.max(Math.abs(pharmacyId), assignments.length + 1);
    const assignment: NormalizedAdminAssignment = {
      id: syntheticId,
      pharmacy_id: pharmacyId,
      pharmacy_name: membership?.pharmacy_name ?? null,
      admin_level: 'MANAGER',
      capabilities: [...ALL_ADMIN_CAPABILITIES],
      staff_role: membership?.staff_role ?? null,
      job_title: membership?.job_title ?? null,
    };
    assignments.push(assignment);
    byPharmacy.set(pharmacyId, assignment);
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
  if (pharmacyId == null) return true;
  if (normalizeRole(membership.role) === 'ORG_ADMIN') return true;
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
  if (normalizeRole(user.role) === 'OWNER') return true;

  const requestedPharmacyId = numericPharmacyId(options.pharmacyId);
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

  if (ownedPharmacies.size > 0 || orgHasCapability) return true;

  const activeId = Number(options.activeAdminAssignmentId);
  if (Number.isFinite(activeId)) {
    const active = assignments.find((assignment) => assignment.id === activeId);
    if (active) return active.capabilities.includes(capability);
  }

  return assignments.some((assignment) => assignment.capabilities.includes(capability));
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

  const first = assignments.find((assignment) => assignment.id != null);
  if (first?.id != null) return { mode: 'admin', assignmentId: first.id };

  return { mode: 'staff', assignmentId: null };
}
