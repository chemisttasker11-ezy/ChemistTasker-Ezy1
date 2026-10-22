/** Shared, pure owner-onboarding pharmacy-count rule for Vite and Next.
 * Both clients retain their platform session/route handling locally.
 * No browser globals, network access, persona changes or authorization policy.
 */
export function countOwnedPharmaciesFromUser(user?: unknown): number {
  const candidate = user as ({ memberships?: unknown; [key: string]: unknown }) | null | undefined;
  if (!candidate) return 0;

  for (const key of ["owned_pharmacies", "owner_pharmacies", "pharmacies"]) {
    const value = candidate[key];
    if (Array.isArray(value) && value.length > 0) {
      return value.length;
    }
  }

  if (!Array.isArray(candidate.memberships)) return 0;

  const ownedPharmacyIds = new Set<number>();
  for (const membership of candidate.memberships) {
    if (!membership || typeof membership !== "object" || !("pharmacy_id" in membership)) {
      continue;
    }

    const role = String((membership as any).role || "").toUpperCase();
    const isOwner =
      role === "OWNER" ||
      role === "PHARMACY_OWNER" ||
      (membership as any).is_pharmacy_owner === true;

    const pharmacyId = Number((membership as any).pharmacy_id);
    if (isOwner && Number.isFinite(pharmacyId)) {
      ownedPharmacyIds.add(pharmacyId);
    }
  }

  return ownedPharmacyIds.size;
}

