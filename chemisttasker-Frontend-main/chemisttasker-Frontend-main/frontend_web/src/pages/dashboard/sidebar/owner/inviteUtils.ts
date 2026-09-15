import { searchUsers } from "@chemisttasker/shared-core";
import type { Role, UserPortalRole } from "./types";
import {
  requiredUserRoleForMembership,
  formatMembershipRole,
  formatUserPortalRole,
} from "./types";

export const normalizeEmail = (value: string): string => value.trim().toLowerCase();

export const fetchUserRoleByEmail = async (rawEmail: string): Promise<UserPortalRole | null> => {
  const email = normalizeEmail(rawEmail);
  if (!email || !email.includes("@")) {
    return null;
  }

  const response = await searchUsers(email);
  const results = Array.isArray((response as any)?.results)
    ? (response as any).results
    : Array.isArray(response)
    ? response
    : [];
  const match = results.find(
    (user: any) => typeof user?.email === "string" && user.email.toLowerCase() === email
  );

  const role = match?.role;
  if (typeof role === "string") {
    return role as UserPortalRole;
  }
  return null;
};

export const describeRoleMismatch = (
  membershipRole: Role,
  userRole: UserPortalRole | null | undefined
): string | null => {
  const requiredUserRole = requiredUserRoleForMembership(membershipRole);
  if (!requiredUserRole || userRole === null || typeof userRole === "undefined") {
    return null;
  }
  if (userRole === requiredUserRole) {
    return null;
  }

  const membershipLabel = formatMembershipRole(membershipRole);
  const actualLabel = formatUserPortalRole(userRole);
  const requiredLabel = formatUserPortalRole(requiredUserRole);
  return `${membershipLabel} invites require a ${requiredLabel} account, but this email belongs to a ${actualLabel}.`;
};

export const formatExistingUserRole = (
  userRole: UserPortalRole | null | undefined
): string | null => {
  if (userRole === null || typeof userRole === "undefined") {
    return null;
  }
  return `Existing account: ${formatUserPortalRole(userRole)}`;
};
