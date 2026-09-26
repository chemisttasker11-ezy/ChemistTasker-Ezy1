import {loginHref} from '../../landing_next/shared/browser-session';
// src/components/ProtectedRoute.tsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { hasOrganizationAccess } from "@chemisttasker/shared-core";
import { resolveDashboardPath } from "../utils/dashboardPath";
import { canAccessRoute } from "./routeAccess";
import type { AdminCapability } from "../constants/adminCapabilities";

type ProtectedRouteProps = {
  children: React.ReactElement;
  requiredRole?: string;
  requireAdmin?: boolean;
  requiredCapability?: AdminCapability;
  requiredAnyCapabilities?: AdminCapability[];
};

const ROLES_REQUIRING_BASIC_ONBOARDING = new Set(["PHARMACIST", "OTHER_STAFF", "EXPLORER"]);
const MOBILE_VERIFY_PATH = "/mobile-verify";

function needsMobileVerification(user: any) {
  return !user?.is_mobile_verified;
}

export default function ProtectedRoute({
  children,
  requiredRole,
  requireAdmin = false,
  requiredCapability,
  requiredAnyCapabilities,
}: ProtectedRouteProps) {
  const { user, isLoading, isAdminUser, hasCapability } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div>Loading authentication...</div>;
  }

  if (!user) {
    window.location.replace(loginHref(location.pathname+location.search+location.hash));
    return <div role="status">Opening sign in…</div>;
  }

  const hasOrgRole = hasOrganizationAccess(user);

  const isMobileVerificationRoute = location.pathname.startsWith(MOBILE_VERIFY_PATH);

  if (
    ROLES_REQUIRING_BASIC_ONBOARDING.has(user.role) &&
    needsMobileVerification(user) &&
    !isMobileVerificationRoute
  ) {
    return (
      <Navigate
        to={MOBILE_VERIFY_PATH}
        state={{ from: location }}
        replace
      />
    );
  }

  const capabilityRequirementPresent = Boolean(requiredCapability || requiredAnyCapabilities?.length);
  const capabilityRequirementSatisfied = requiredCapability
    ? hasCapability(requiredCapability)
    : requiredAnyCapabilities?.length
      ? requiredAnyCapabilities.some((capability) => hasCapability(capability))
      : true;

  if (
    canAccessRoute({
      userRole: user.role,
      requiredRole,
      requireAdmin,
      isAdminUser,
      hasOrgRole,
      requiresCapability: capabilityRequirementPresent,
      hasRequiredCapability: capabilityRequirementSatisfied,
    })
  ) {
    return children;
  }

  return (
    <Navigate
      to={resolveDashboardPath(user.role)}
      replace
    />
  );
}
