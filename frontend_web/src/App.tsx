import { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { ReactRouterAppProvider } from "@toolpad/core/react-router";
import { useAuth } from "./contexts/AuthContext";
import { useWorkspace } from "./contexts/WorkspaceContext";
import {
  getOrganizationNav,
  getAdminNav,
  getOwnerNav,
  getPharmacistNavDynamic,
  getOtherStaffNavDynamic,
  getExplorerNav,
} from "./navigation";
import { DashboardNavigationProvider } from "./contexts/DashboardNavigationContext";
import { getOnboarding, hasOrganizationAccess } from "@chemisttasker/shared-core";

// ✨ HOOK 1: Your existing hook for onboarding progress
function useOnboardingProgress(user: any, persona: string) {
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    if (!user || persona === "admin") {
      setProgress((prev) => (prev === 0 ? prev : 0));
      return;
    }
    let isMounted = true;
    const validRoles = ["owner", "pharmacist", "other_staff", "explorer"];
    const role = user.role;
    if (role && validRoles.includes(role.toLowerCase())) {
      let key =
        role.toLowerCase() === "other_staff"
          ? "otherstaff"
          : role.toLowerCase();

      getOnboarding(key as any)
        .then((res: any) => {
          if (isMounted) setProgress(res?.progress_percent ?? 0);
        })
        .catch(() => {
          if (isMounted) setProgress(0);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [user, persona]); // Listen for user changes, not just role

  return progress;
}

export default function App() {
  const {
    user,
    isLoading,
    unreadCount,
    activePersona,
    adminAssignments,
    activeAdminAssignment,
    activeAdminPharmacyId,
  } = useAuth();
  const { workspace, canUseInternal } = useWorkspace();
  const effectiveWorkspace: "internal" | "platform" = canUseInternal ? workspace : "platform";
  const navigate = useNavigate();
  const location = useLocation();
  const prevPersonaRef = useRef<string | null>(null);
  const prevAdminPharmacyRef = useRef<number | null>(null);
  
  // Call your existing progress hook
  const progress = useOnboardingProgress(user, activePersona);

  const fallbackAdminAssignment = useMemo(() => {
    if (activeAdminAssignment) {
      return activeAdminAssignment;
    }
    return adminAssignments.find((assignment) => assignment.id != null) ?? null;
  }, [activeAdminAssignment, adminAssignments]);

  const scopedAdminPharmacyId = useMemo(() => {
    return activeAdminPharmacyId ?? fallbackAdminAssignment?.pharmacy_id ?? null;
  }, [activeAdminPharmacyId, fallbackAdminAssignment]);

  const hasOrgRole = useMemo(() => hasOrganizationAccess(user), [user]);
  const isOrgPersona = hasOrgRole && (
    location.pathname.startsWith('/dashboard/organization/') ||
    (activePersona !== 'admin' && ['ORGANIZATION', 'ORG_OWNER', 'ORG_STAFF', 'ORG_ADMIN', 'CHIEF_ADMIN', 'REGION_ADMIN'].includes(user?.role ?? ''))
  );

  useEffect(() => {
    if (!user) {
      prevPersonaRef.current = null;
      prevAdminPharmacyRef.current = null;
      return;
    }

    if (
      user.role !== "OWNER" &&
      activePersona === "admin" &&
      scopedAdminPharmacyId != null
    ) {
      const adminBase = `/dashboard/admin/${scopedAdminPharmacyId}`;
      const pathname = location.pathname;
      const isDashboardRoot =
        pathname === "/dashboard" || pathname === "/dashboard/";
      const isAdminRoute = pathname.startsWith("/dashboard/admin");
      const shouldForceAdminRedirect = isDashboardRoot || isAdminRoute;
      const isOnCurrentAdminRoute =
        pathname === adminBase ||
        pathname === `${adminBase}/` ||
        pathname.startsWith(`${adminBase}/`);

      const isExactlyAdminBase =
        pathname === adminBase || pathname === `${adminBase}/`;

      const previousPersona = prevPersonaRef.current;
      const previousPharmacy = prevAdminPharmacyRef.current;

      const personaOrPharmacyChanged =
        previousPersona !== "admin" || previousPharmacy !== scopedAdminPharmacyId;

      if (
        personaOrPharmacyChanged &&
        shouldForceAdminRedirect &&
        (!isOnCurrentAdminRoute || isExactlyAdminBase)
      ) {
        navigate(`${adminBase}/overview`, { replace: true });
      }
    }

    prevPersonaRef.current = activePersona;
    prevAdminPharmacyRef.current = scopedAdminPharmacyId;
  }, [activePersona, scopedAdminPharmacyId, navigate, user, location.pathname]);
  
  const nav = useMemo(() => {
    if (!user) return [];
    
    const hasUnreadMessages = unreadCount > 0;

    if (isOrgPersona) {
      return getOrganizationNav(hasUnreadMessages);
    }

    const hasAdminAssignments = adminAssignments.length > 0;

    if (activePersona === "admin" && hasAdminAssignments) {
      return getAdminNav({
        assignments: adminAssignments,
        hasUnreadMessages,
        userRole: user.role,
        activeAssignment: fallbackAdminAssignment,
        activePharmacyId: scopedAdminPharmacyId,
      });
    }

    // Default to staff persona if not admin
    if (user.role === "OWNER") {
      return getOwnerNav(progress, hasUnreadMessages);
    }
    if (user.role === "PHARMACIST") {
      return getPharmacistNavDynamic(progress, effectiveWorkspace, hasUnreadMessages);
    }
    if (user.role === "OTHER_STAFF") {
      return getOtherStaffNavDynamic(progress, effectiveWorkspace, hasUnreadMessages);
    }
    if (user.role === "EXPLORER") {
      return getExplorerNav(progress, hasUnreadMessages);
    }

    return [];
  }, [
    user,
    progress,
    workspace,
    effectiveWorkspace,
    canUseInternal,
    unreadCount,
    activePersona,
    adminAssignments,
    activeAdminAssignment,
    scopedAdminPharmacyId,
    fallbackAdminAssignment,
    isOrgPersona,
  ]);

  if (isLoading) return null;
  if (!user) return <Outlet />;

  return (
    <ReactRouterAppProvider
      navigation={nav}
      branding={{ title: "ChemistTasker" }}
    >
      <DashboardNavigationProvider navigation={nav}>
        <Outlet />
      </DashboardNavigationProvider>
    </ReactRouterAppProvider>
  );
}
