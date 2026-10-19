import { useAhpra } from '../contexts/AhpraContext';
import AhpraStatus from './AhpraStatus';
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
  return !user?.is_mobile_verified && !user?.mobile_check_skipped;
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
  const ahpra = useAhpra();
  const roleKey = user?.role === 'OWNER' ? 'owner' : user?.role === 'PHARMACIST' ? 'pharmacist' : 'otherstaff';
  const ahpraStep = roleKey === 'pharmacist' ? 'basic' : 'regulatory docs';
  const recoveryPath = roleKey === 'owner' ? '/onboarding/owner' : `/onboarding/${roleKey}?step=${encodeURIComponent(ahpraStep)}`;
  const onAhpraStep = location.pathname === `/onboarding/${roleKey}` && (roleKey === 'owner' || new URLSearchParams(location.search).get('step') === ahpraStep);
  React.useEffect(() => {
    if (onAhpraStep && ahpra.refusal) ahpra.clearRefusal();
  }, [onAhpraStep, ahpra.refusal, ahpra.clearRefusal]);

  if (isLoading) {
    return <div>Loading authentication...</div>;
  }

  if (!user) {
    window.location.replace(loginHref(location.pathname+location.search+location.hash));
    return <div role="status">Opening sign in…</div>;
  }

  if (location.pathname.endsWith('/logout')) return children;
  if (ahpra.loading) return <div role="status">Loading AHPRA status...</div>;
  if ((ahpra.summary?.state === 'suspended' || ahpra.refusal) && !onAhpraStep) {
    return <><AhpraStatus /><Navigate to={recoveryPath} replace /></>;
  }
  if (ahpra.summary?.state === 'suspended' && onAhpraStep) return children;

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
      // OWNER routes are allowed through the admin shell only so that
      // AdminDashboardWrapper can canonicalize stale owner-facing /admin links.
      // Actual delegated admin access is still exact-assignment checked there.
      isAdminUser: isAdminUser || (requireAdmin && user.role === "OWNER"),
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
