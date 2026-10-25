export function resolveDashboardPath(role?: string | null, subpath = "overview") {
  switch (role) {
    case "ORG_ADMIN":
    case "ORG_STAFF":
    case "ORG_OWNER":
    case "CHIEF_ADMIN":
    case "REGION_ADMIN":
    case "ORGANIZATION":
      return `/dashboard/organization/${subpath}`;
    case "OWNER":
      return `/dashboard/owner/${subpath}`;
    case "PHARMACIST":
      return `/dashboard/pharmacist/${subpath}`;
    case "OTHER_STAFF":
      return `/dashboard/otherstaff/${subpath}`;
    case "EXPLORER":
      return `/dashboard/explorer/${subpath}`;
    case "PHARMACY_MANAGER":
      // No generic pharmacy-manager dashboard exists. If every delegated
      // assignment is gone, the invitations page is the safe valid landing.
      return "/dashboard/admin-invitations";
    default:
      return "/dashboard";
  }
}
