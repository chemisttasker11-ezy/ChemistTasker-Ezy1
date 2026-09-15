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
    default:
      return "/dashboard";
  }
}
