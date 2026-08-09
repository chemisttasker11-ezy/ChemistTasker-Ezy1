const OTHER_STAFF_ROLE_LABELS: Record<string, string> = {
  INTERN: "Intern Pharmacist",
  TECHNICIAN: "Dispensary Technician",
  ASSISTANT: "Pharmacy Assistant",
  STUDENT: "Pharmacy Student",
};

export function otherStaffRoleLabel(roleType?: string | null, fallback = "Other Staff") {
  const normalized = String(roleType || "").trim().toUpperCase();
  return OTHER_STAFF_ROLE_LABELS[normalized] ?? fallback;
}

export function dashboardTitleForRole(role?: string | null, otherStaffRoleType?: string | null) {
  const normalized = String(role || "").toUpperCase();
  if (normalized === "OWNER") return "Owner Dashboard";
  if (normalized === "PHARMACIST") return "Pharmacist Dashboard";
  if (normalized === "OTHER_STAFF") return `${otherStaffRoleLabel(otherStaffRoleType)} Dashboard`;
  if (normalized === "EXPLORER") return "Explorer Dashboard";
  if (normalized.includes("ORG") || normalized === "ORGANIZATION") return "Organization Dashboard";
  return "Dashboard";
}

export function userRoleLabel(role?: string | null, otherStaffRoleType?: string | null) {
  const normalized = String(role || "").toUpperCase();
  if (normalized === "OTHER_STAFF") return otherStaffRoleLabel(otherStaffRoleType);
  if (normalized.includes("ORG") || normalized === "ORGANIZATION") return "Organization";
  if (!normalized) return "Member";
  return normalized
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
