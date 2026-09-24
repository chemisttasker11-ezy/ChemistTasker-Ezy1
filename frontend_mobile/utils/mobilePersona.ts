import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  hasOrganizationAccess as sharedHasOrganizationAccess,
  normalizeAdminAssignments,
  resolveAdminPersonaAssignmentId,
  resolvePersonaSelection,
  type AuthorityUser,
  type NormalizedAdminAssignment,
} from '@chemisttasker/shared-core';

export type MobileAdminAssignment = NormalizedAdminAssignment;

const PERSONA_KEY_PREFIX = 'ct-active-persona';

function storageKey(user: AuthorityUser | null | undefined) {
  const id = user?.id ?? user?.email ?? user?.username;
  return id ? `${PERSONA_KEY_PREFIX}:${id}` : PERSONA_KEY_PREFIX;
}

export function hasOrganizationAccess(user: AuthorityUser | null | undefined) {
  return sharedHasOrganizationAccess(user);
}

export function getAdminAssignments(user: AuthorityUser | null | undefined): MobileAdminAssignment[] {
  return normalizeAdminAssignments(user);
}

export function getAssignmentId(assignment?: MobileAdminAssignment | null) {
  const raw = assignment?.id;
  return raw == null ? null : Number(raw);
}

export function getAssignmentPharmacyId(assignment?: MobileAdminAssignment | null) {
  const value = Number(assignment?.pharmacy_id);
  return Number.isFinite(value) ? value : null;
}

export function getAssignmentPharmacyName(assignment?: MobileAdminAssignment | null) {
  const pharmacyId = getAssignmentPharmacyId(assignment);
  return assignment?.pharmacy_name ?? (pharmacyId ? `Pharmacy #${pharmacyId}` : 'Admin pharmacy');
}

export function getRoleHome(role?: string | null) {
  switch (String(role || '').toUpperCase()) {
    case 'OWNER':
      return '/owner/dashboard';
    case 'PHARMACIST':
      return '/pharmacist/dashboard';
    case 'OTHER_STAFF':
      return '/otherstaff/dashboard';
    case 'EXPLORER':
      return '/explorer/dashboard';
    case 'ORGANIZATION':
    case 'ORG_ADMIN':
    case 'ORG_OWNER':
    case 'ORG_STAFF':
    case 'CHIEF_ADMIN':
    case 'REGION_ADMIN':
      return '/organization/dashboard';
    default:
      return '/login';
  }
}

export async function readPersonaSelection(user: AuthorityUser | null | undefined) {
  try {
    return await AsyncStorage.getItem(storageKey(user));
  } catch {
    return null;
  }
}

export async function selectRolePersona(user: AuthorityUser | null | undefined) {
  const role = String(user?.role || '').toUpperCase();
  try {
    await AsyncStorage.setItem(storageKey(user), `ROLE:${role}`);
  } catch {
    // Routing must remain usable even if persistence is unavailable.
  }
  return getRoleHome(role);
}

export async function selectAdminPersona(user: AuthorityUser | null | undefined, assignmentId?: number | null) {
  const assignments = getAdminAssignments(user);
  const resolvedId = assignmentId != null
    ? Number(assignmentId)
    : resolveAdminPersonaAssignmentId(user);
  const selected = resolvedId != null
    ? assignments.find((assignment) => getAssignmentId(assignment) === resolvedId)
    : null;
  const id = getAssignmentId(selected);
  if (!selected || id == null) return null;
  try {
    await AsyncStorage.setItem(storageKey(user), `ADMIN:${id}`);
  } catch {
    // Routing must remain usable even if persistence is unavailable.
  }
  return selected;
}

export async function getSelectedAdminAssignment(user: AuthorityUser | null | undefined) {
  const assignments = getAdminAssignments(user);
  if (!assignments.length) return null;

  const stored = await readPersonaSelection(user);
  const selection = resolvePersonaSelection(user, stored);
  if (selection.mode === 'admin' && selection.assignmentId != null) {
    return assignments.find((assignment) => getAssignmentId(assignment) === selection.assignmentId) ?? assignments[0] ?? null;
  }
  return null;
}

export async function resolveInitialWorkspace(user: AuthorityUser | null | undefined) {
  if (!user) return '/login';
  if (hasOrganizationAccess(user)) return '/organization/dashboard';

  const role = String(user?.role || '').toUpperCase();
  if (role === 'OWNER') return '/owner/dashboard';

  const stored = await readPersonaSelection(user);
  const selection = resolvePersonaSelection(user, stored);
  if (selection.mode === 'admin' && selection.assignmentId != null) {
    await selectAdminPersona(user, selection.assignmentId);
    return '/admin';
  }

  if (selection.mode === 'staff') {
    await selectRolePersona(user);
  }
  return getRoleHome(role);
}
