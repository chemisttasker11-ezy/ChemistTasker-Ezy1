type Assignment = {
  id?: number;
  pharmacy_id?: number;
  pharmacyId?: number;
  pharmacy?: number;
  pharmacy_name?: string;
  pharmacyName?: string;
  [key: string]: unknown;
};

export function getAdminAssignments(user: unknown): Assignment[] {
  const assignments = (user as { admin_assignments?: unknown })?.admin_assignments;
  return Array.isArray(assignments) ? assignments : [];
}

export function assignmentPharmacyId(assignment: Assignment): number | null {
  const id = Number(assignment.pharmacy_id ?? assignment.pharmacyId ?? assignment.pharmacy);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function selectAdminAssignment(user: unknown, selectedPharmacyId: number | null): Assignment | null {
  const assignments = getAdminAssignments(user);
  return assignments.find((item) => assignmentPharmacyId(item) === selectedPharmacyId)
    ?? assignments[0]
    ?? null;
}
