export type RouteAccessInput = {
  userRole?: string | null;
  requiredRole?: string;
  requireAdmin?: boolean;
  isAdminUser?: boolean;
  hasOrgRole?: boolean;
  requiresCapability?: boolean;
  hasRequiredCapability?: boolean;
};

export function canAccessRoute({
  userRole,
  requiredRole,
  requireAdmin = false,
  isAdminUser = false,
  hasOrgRole = false,
  requiresCapability = false,
  hasRequiredCapability = false,
}: RouteAccessInput): boolean {
  if (requiresCapability && !hasRequiredCapability) return false;
  if (requireAdmin) return isAdminUser;
  if (!requiredRole) return true;
  if (userRole === requiredRole) return true;
  if (requiredRole === "ORG_ADMIN") return hasOrgRole;

  // A pharmacy-admin assignment is not ownership. OWNER routes remain
  // owner-only even when a staff member administers one or more pharmacies.
  return false;
}
