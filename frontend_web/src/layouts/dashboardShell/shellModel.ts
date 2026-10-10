import { canAccessOrganizationPharmacies, isInternalPharmacyMembership } from "@chemisttasker/shared-core";

export const DNA = {
  navy: "#061A3D",
  navy2: "#02122C",
  blue: "#3C18A8",
  violet: "#5222B8",
  magenta: "#EA0A8E",
  cyan: "#08BEEA",
  ink: "#06123A",
  muted: "#5E6B8D",
  page: "#F7FAFF",
  line: "#E5ECF7",
};

export type PharmacyOption = {
  id: number;
  name: string;
  helper?: string;
};

const dashboardAccents = [
  {
    gradient: `linear-gradient(135deg, ${DNA.blue} 0%, ${DNA.violet} 52%, ${DNA.magenta} 100%)`,
    soft: "#EFE7FF",
    text: "#4A16B8",
  },
  {
    gradient: `linear-gradient(135deg, ${DNA.blue} 0%, ${DNA.violet} 52%, ${DNA.magenta} 100%)`,
    soft: "#EFE7FF",
    text: "#4A16B8",
  },
  {
    gradient: `linear-gradient(135deg, ${DNA.blue} 0%, ${DNA.violet} 52%, ${DNA.magenta} 100%)`,
    soft: "#EFE7FF",
    text: "#4A16B8",
  },
];

export function accentForScope(_scopeId: number | null, _workspace: string) {
  return dashboardAccents[0];
}

export function workerOverviewPath(role?: string | null) {
  const normalized = String(role || "").toUpperCase();
  if (normalized === "PHARMACIST") return "/dashboard/pharmacist/overview";
  if (normalized === "OTHER_STAFF") return "/dashboard/otherstaff/overview";
  if (normalized === "EXPLORER") return "/dashboard/explorer/overview";
  if (normalized === "OWNER") return "/dashboard/owner/overview";
  return "/dashboard";
}

export function collectPharmacies(user: any, adminAssignments: any[]): PharmacyOption[] {
  const byId = new Map<number, PharmacyOption>();
  const add = (idRaw: unknown, nameRaw: unknown, helper?: string) => {
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) return;
    const name = typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : `Pharmacy #${id}`;
    if (!byId.has(id)) byId.set(id, { id, name, helper });
  };

  // Owner authority comes from OWNER-level admin rows; the owner's own membership is a CONTACT membership.
  const ownedIds = new Set(
    (adminAssignments ?? [])
      .filter((assignment) => String(assignment?.admin_level ?? "").toUpperCase() === "OWNER")
      .map((assignment) => Number(assignment?.pharmacy_id)),
  );
  const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
  memberships.forEach((membership: any) => {
    const role = String(membership?.role ?? "").toUpperCase();
    const pharmacyId = Number(membership?.pharmacy_id ?? membership?.pharmacyId ?? membership?.pharmacy?.id);
    const employmentType = String(membership?.employment_type ?? membership?.employmentType ?? "").toUpperCase();
    if (isInternalPharmacyMembership(membership)) {
      add(
        membership?.pharmacy_id ?? membership?.pharmacyId ?? membership?.pharmacy?.id,
        membership?.pharmacy_name ?? membership?.pharmacyName ?? membership?.pharmacy?.name,
        role === "OWNER" || role === "PHARMACY_OWNER" || membership?.is_pharmacy_owner === true || ownedIds.has(pharmacyId)
          ? "Owner"
          : employmentType === "LOCUM"
            ? "Locum"
            : employmentType === "SHIFT_HERO"
              ? "Shift Hero"
              : membership?.role
      );
    }
    if (canAccessOrganizationPharmacies(membership) && Array.isArray(membership?.pharmacies)) {
      membership.pharmacies.forEach((pharmacy: any) => add(pharmacy?.id, pharmacy?.name, "Organization pharmacy"));
    }
  });

  adminAssignments.forEach((assignment: any) => {
    add(assignment?.pharmacy_id, assignment?.pharmacy_name, assignment?.admin_level ?? "Admin assignment");
  });

  const ownerPharmacies = [user?.pharmacies, user?.owner_pharmacies, user?.owned_pharmacies].find(Array.isArray) ?? [];
  ownerPharmacies.forEach((pharmacy: any) => {
    add(pharmacy?.id, pharmacy?.name, "Owner");
  });

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}
