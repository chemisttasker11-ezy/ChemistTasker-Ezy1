import { useAhpra } from '../contexts/AhpraContext';
import AhpraStatus from './AhpraStatus';
import {loginHref} from '../../landing_next/shared/browser-session';
// src/components/ProtectedRoute.tsx
import React from "react";
import { Navigate, useLocation, Link } from "react-router-dom";
import { Box, Button, CircularProgress, Container, Paper, Typography } from "@mui/material";
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
  const roleKey = user?.role === 'PHARMACIST' ? 'pharmacist' : 'otherstaff';
  const ahpraStep = roleKey === 'pharmacist' ? 'basic' : 'regulatory docs';
  const recoveryPath = `/onboarding/${roleKey}?step=${encodeURIComponent(ahpraStep)}`;
  const onAhpraStep = location.pathname === `/onboarding/${roleKey}` && new URLSearchParams(location.search).get('step') === ahpraStep;
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

  const isAhpraRole = user.role === 'PHARMACIST' || user.role === 'OTHER_STAFF';
  const isFrozen = isAhpraRole && Boolean(ahpra.summary?.frozen || ahpra.refusal);

  if (isAhpraRole && ahpra.loading) {
    return (
      <Box sx={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, textAlign: 'center' }}>
        <CircularProgress size={32} sx={{ mb: 2 }} />
        <Typography variant="body1" color="text.secondary">Verifying account registration…</Typography>
      </Box>
    );
  }

  if (isFrozen && onAhpraStep) return children;

  // Invitations are never blocked by AHPRA: the invite email links land here.
  const onInvitePage = /^\/dashboard\/((pharmacist|otherstaff)\/memberships|admin-invitations)\/?$/.test(location.pathname);

  if (isFrozen && !onAhpraStep && !onInvitePage) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
          <Typography variant="h5" fontWeight={600} gutterBottom>
            Account Access Paused
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Your account is temporarily paused pending AHPRA registration review. Please review and update your registration details to restore access.
          </Typography>
          <AhpraStatus submitLabel={roleKey === 'pharmacist' ? 'Submit & Verify Basic' : 'Save role & qualifications'} />
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Button variant="contained" component={Link} to={recoveryPath}>
              Go to Account Details
            </Button>
          </Box>
        </Paper>
      </Container>
    );
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
