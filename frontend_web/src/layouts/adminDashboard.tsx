import { ReactNode, useEffect, useMemo } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { CircularProgress, Stack, Typography } from "@mui/material";
import { isAdminPersonaAssignment } from "@chemisttasker/shared-core";
import { useAuth } from "../contexts/AuthContext";
import { ColorModeProvider } from "../theme/sleekTheme";
import { AdminScopeProvider } from "../contexts/AdminScopeContext";
import { resolveDashboardPath } from "../utils/dashboardPath";
import DashboardTopShell from "./DashboardTopShell";

export default function AdminDashboardWrapper() {
  const { pharmacyId: pharmacyIdParam } = useParams<{ pharmacyId: string }>();
  const {
    user,
    adminAssignments,
    selectAdminPersona,
    activeAdminAssignment,
    activePersona,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const targetPharmacyId = useMemo(() => {
    const parsed = pharmacyIdParam ? Number(pharmacyIdParam) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }, [pharmacyIdParam]);

  const delegatedAssignments = useMemo(
    () => adminAssignments.filter((item) => isAdminPersonaAssignment(item)),
    [adminAssignments],
  );

  // An explicit /admin/:pharmacyId route is authoritative. Never substitute a
  // different assignment: doing so can silently cross pharmacy scope.
  const assignment = useMemo(() => {
    if (targetPharmacyId == null) return null;
    return delegatedAssignments.find((item) => item.pharmacy_id === targetPharmacyId) ?? null;
  }, [delegatedAssignments, targetPharmacyId]);

  const ownerAuthorityAssignment = useMemo(() => {
    if (targetPharmacyId == null) return null;
    return adminAssignments.find(
      (item) => item.pharmacy_id === targetPharmacyId && item.admin_level === "OWNER",
    ) ?? null;
  }, [adminAssignments, targetPharmacyId]);

  useEffect(() => {
    if (assignment || targetPharmacyId == null) return;

    if (user?.role === "OWNER") {
      const params = new URLSearchParams(location.search);
      // Preserve an explicit owner workspace selection (for example the
      // reported /admin/16?...pharmacy_id=27 case). For a stale onboarding
      // link with no query scope, carry the now-owned pharmacy into owner mode.
      if (!params.has("pharmacy_id") && ownerAuthorityAssignment) {
        params.set("pharmacy_id", String(targetPharmacyId));
      }
      const ownerPath = location.pathname.replace(
        /^\/dashboard\/admin\/[^/]+/,
        "/dashboard/owner",
      );
      const query = params.toString();
      navigate(query ? `${ownerPath}?${query}` : ownerPath, { replace: true });
      return;
    }

    // Non-owners with no exact delegated assignment are returned to their own
    // dashboard. We intentionally do not fall back to adminAssignments[0].
    navigate(resolveDashboardPath(user?.role), { replace: true });
  }, [
    assignment,
    location.pathname,
    location.search,
    navigate,
    ownerAuthorityAssignment,
    targetPharmacyId,
    user?.role,
  ]);

  useEffect(() => {
    if (!assignment || assignment.id == null) return;
    if (activeAdminAssignment?.id !== assignment.id || activePersona !== "admin") {
      selectAdminPersona(assignment.id);
    }
  }, [
    assignment,
    activePersona,
    activeAdminAssignment?.id,
    selectAdminPersona,
  ]);

  useEffect(() => {
    if (!assignment || targetPharmacyId == null) return;
    const params = new URLSearchParams(location.search);
    const scopedId = Number(params.get("pharmacy_id"));
    const workspace = params.get("workspace");
    if (scopedId === targetPharmacyId && workspace === "internal") return;

    params.set("workspace", "internal");
    params.set("pharmacy_id", String(targetPharmacyId));
    const query = params.toString();
    navigate(query ? `${location.pathname}?${query}` : location.pathname, { replace: true });
  }, [assignment, location.pathname, location.search, navigate, targetPharmacyId]);

  if (!assignment) {
    return null;
  }

  let layoutContent: ReactNode;
  let wrapWithScope = false;

  if (activePersona !== "admin" || activeAdminAssignment?.id !== assignment.id) {
    layoutContent = (
      <Stack
        spacing={2}
        alignItems="center"
        justifyContent="center"
        sx={{ py: 6 }}
      >
        <CircularProgress />
        <Typography color="text.secondary">Preparing admin context...</Typography>
      </Stack>
    );
  } else {
    layoutContent = <Outlet />;
    wrapWithScope = true;
  }

  const layout = (
    <DashboardTopShell titleOverride={assignment.pharmacy_name ?? "Admin Dashboard"} forceAdminScope>
      {layoutContent}
    </DashboardTopShell>
  );

  return (
    <ColorModeProvider>
      {wrapWithScope ? (
        <AdminScopeProvider assignment={assignment}>{layout}</AdminScopeProvider>
      ) : (
        layout
      )}
    </ColorModeProvider>
  );
}
