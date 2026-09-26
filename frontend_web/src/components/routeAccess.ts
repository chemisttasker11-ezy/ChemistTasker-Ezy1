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
  if (requiredRole === "ORGANIZATION") return hasOrgRole;

  // ChemistTasker pharmacy admins intentionally inherit the owner-side
  // workspace/persona. Their individual capabilities still determine which
  // delegated owner responsibilities and actions they can use.
  if (requiredRole === "OWNER" && isAdminUser) return true;

  return false;
}
