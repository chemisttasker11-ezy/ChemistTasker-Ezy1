import {loginHref} from '../../landing_next/shared/browser-session';
// src/components/ProtectedRoute.tsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ORG_ROLES } from "../constants/roles";
import { resolveDashboardPath } from "../utils/dashboardPath";
import { canAccessRoute } from "./routeAccess";
import type { AdminCapability } from "../constants/adminCapabilities";

type ProtectedRouteProps = {
  children: React.ReactElement;
  requiredRole?: string;
  requireAdmin?: boolean;
  requiredCapability?: AdminCapability;
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

  const hasOrgRole =
    Array.isArray(user.memberships) &&
    user.memberships.some((m: any) => ORG_ROLES.includes(m.role as any));

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

  if (
    canAccessRoute({
      userRole: user.role,
      requiredRole,
      requireAdmin,
      isAdminUser,
      hasOrgRole,
      requiresCapability: Boolean(requiredCapability),
      hasRequiredCapability: requiredCapability ? hasCapability(requiredCapability) : true,
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
