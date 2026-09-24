import AsyncStorage from '@react-native-async-storage/async-storage';

export type MobileAdminAssignment = {
  id?: number | null;
  pharmacy_id?: number | null;
  pharmacyId?: number | null;
  pharmacy?: number | null;
  pharmacy_name?: string | null;
  pharmacyName?: string | null;
  capabilities?: string[];
};

const ORG_ROLES = new Set(['ORGANIZATION', 'ORG_ADMIN', 'ORG_OWNER', 'ORG_STAFF', 'CHIEF_ADMIN', 'REGION_ADMIN']);
const PERSONA_KEY_PREFIX = 'ct-active-persona';

function storageKey(user: any) {
  const id = user?.id ?? user?.email ?? user?.username;
  return id ? `${PERSONA_KEY_PREFIX}:${id}` : PERSONA_KEY_PREFIX;
}

export function hasOrganizationAccess(user: any) {
  const role = String(user?.role || '').toUpperCase();
  if (ORG_ROLES.has(role)) return true;
  return Array.isArray(user?.memberships) && user.memberships.some((membership: any) =>
    ORG_ROLES.has(String(membership?.role || '').toUpperCase())
  );
}

export function getAdminAssignments(user: any): MobileAdminAssignment[] {
  return Array.isArray(user?.admin_assignments)
    ? user.admin_assignments.filter((assignment: any) =>
        Number.isFinite(Number(assignment?.pharmacy_id ?? assignment?.pharmacyId ?? assignment?.pharmacy))
      )
    : [];
}

export function getAssignmentId(assignment?: MobileAdminAssignment | null) {
  const raw = assignment?.id;
  return raw == null ? null : Number(raw);
}

export function getAssignmentPharmacyId(assignment?: MobileAdminAssignment | null) {
  const raw = assignment?.pharmacy_id ?? assignment?.pharmacyId ?? assignment?.pharmacy;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function getAssignmentPharmacyName(assignment?: MobileAdminAssignment | null) {
  const pharmacyId = getAssignmentPharmacyId(assignment);
  return assignment?.pharmacy_name ?? assignment?.pharmacyName ?? (pharmacyId ? `Pharmacy #${pharmacyId}` : 'Admin pharmacy');
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

export async function readPersonaSelection(user: any) {
  try {
    return await AsyncStorage.getItem(storageKey(user));
  } catch {
    return null;
  }
}

export async function selectRolePersona(user: any) {
  const role = String(user?.role || '').toUpperCase();
  try {
    await AsyncStorage.setItem(storageKey(user), `ROLE:${role}`);
  } catch {
    // Routing must remain usable even if persistence is unavailable.
  }
  return getRoleHome(role);
}

export async function selectAdminPersona(user: any, assignmentId?: number | null) {
  const assignments = getAdminAssignments(user);
  const selected = assignmentId != null
    ? assignments.find((assignment) => getAssignmentId(assignment) === Number(assignmentId))
    : assignments[0];
  const id = getAssignmentId(selected);
  if (!selected || id == null) return null;
  try {
    await AsyncStorage.setItem(storageKey(user), `ADMIN:${id}`);
  } catch {
    // Routing must remain usable even if persistence is unavailable.
  }
  return selected;
}

export async function getSelectedAdminAssignment(user: any) {
  const assignments = getAdminAssignments(user);
  if (!assignments.length) return null;

  const stored = await readPersonaSelection(user);
  if (stored?.startsWith('ADMIN:')) {
    const id = Number(stored.split(':')[1]);
    const match = assignments.find((assignment) => getAssignmentId(assignment) === id);
    if (match) return match;
  }
  return assignments[0] ?? null;
}

export async function resolveInitialWorkspace(user: any) {
  if (!user) return '/login';
  if (hasOrganizationAccess(user)) return '/organization/dashboard';

  const role = String(user?.role || '').toUpperCase();
  if (role === 'OWNER') return '/owner/dashboard';

  const assignments = getAdminAssignments(user);
  const stored = await readPersonaSelection(user);

  if (stored?.startsWith('ADMIN:') && assignments.length) {
    const id = Number(stored.split(':')[1]);
    if (assignments.some((assignment) => getAssignmentId(assignment) === id)) {
      return '/admin';
    }
  }

  if (stored?.startsWith('ROLE:')) {
    const storedRole = stored.split(':')[1];
    if (storedRole === role) return getRoleHome(role);
  }

  if (assignments.length) {
    await selectAdminPersona(user, getAssignmentId(assignments[0]));
    return '/admin';
  }

  return getRoleHome(role);
}
