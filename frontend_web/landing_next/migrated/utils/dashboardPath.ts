export function resolveDashboardPath(role?: string | null) {
  switch (role) {
    case "ORG_ADMIN":
    case "ORG_STAFF":
    case "ORG_OWNER":
    case "CHIEF_ADMIN":
    case "REGION_ADMIN":
    case "ORGANIZATION":
      return "/dashboard/organization/overview";
    case "OWNER":
      return "/dashboard/owner/overview";
    case "PHARMACIST":
      return "/dashboard/pharmacist/overview";
    case "OTHER_STAFF":
      return "/dashboard/otherstaff/overview";
    case "EXPLORER":
      return "/dashboard/explorer/overview";
    case "PHARMACY_MANAGER":
      // Without assignment data the invitations page is the safe landing (same rule as the Vite app).
      return "/dashboard/admin-invitations";
    default:
      return "/dashboard";
  }
}

type AdminAssignmentLike = { id?: number | null; pharmacy_id?: number | null; admin_level?: string | null };

/**
 * Landing page for a signed-in user. A PHARMACY_MANAGER has no dashboard of its own: it opens the admin dashboard of
 * its first delegated assignment (lowest id, as backend users.navigation does), or admin invitations when it has none.
 */
export function resolveUserHomePath(user?: { role?: string | null; admin_assignments?: AdminAssignmentLike[] | null } | null) {
  if (user?.role === "PHARMACY_MANAGER") {
    const home = (user.admin_assignments ?? [])
      .filter((item) => item?.admin_level !== "OWNER" && typeof item?.pharmacy_id === "number")
      .sort((left, right) => Number(left.id ?? Number.MAX_SAFE_INTEGER) - Number(right.id ?? Number.MAX_SAFE_INTEGER))[0];
    if (home?.pharmacy_id != null) return `/dashboard/admin/${home.pharmacy_id}/overview`;
  }
  return resolveDashboardPath(user?.role);
}
