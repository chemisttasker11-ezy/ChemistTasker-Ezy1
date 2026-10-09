import { ReactNode, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import {
  Box,
  Button,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import StoreIcon from "@mui/icons-material/Store";
import PublicIcon from "@mui/icons-material/Public";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import PersonIcon from "@mui/icons-material/Person";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { useDashboardNavigation } from "../contexts/DashboardNavigationContext";
import TopBarActions from "./TopBarActions";
import DashboardSideNav from "./DashboardSideNav";
import { addDashboardScopeParams, normalizeDashboardSegment } from "./dashboardRouteScope";
import menuLogo from "../assets/clipsnap-edit-6-1-2026.png";
import { canAccessOrganizationPharmacies, fetchAccessibleOrganizationPharmacies, getOnboardingDetail, getOrganizationMembership, hasFavoriteStaffMembership, hasOrganizationAccess, hasVerifiedWorkerProfile, isAdminPersonaAssignment, isInternalPharmacyMembership, fetchPharmaciesService } from "@chemisttasker/shared-core";
import { dashboardTitleForRole, userRoleLabel } from "../utils/roleLabels";

const DNA = {
  navy: "#061A3D",
  navy2: "#02122C",
  blue: "#063BDA",
  violet: "#5222B8",
  magenta: "#EA0A8E",
  cyan: "#08BEEA",
  ink: "#06123A",
  muted: "#5E6B8D",
  page: "#F7FAFF",
  line: "#E5ECF7",
};

type PharmacyOption = {
  id: number;
  name: string;
  helper?: string;
};

const dashboardAccents = [
  {
    gradient: `linear-gradient(135deg, ${DNA.blue} 0%, ${DNA.violet} 52%, ${DNA.magenta} 100%)`,
    soft: "#EFE7FF",
    text: "#4A16B8",
  },
  {
    gradient: `linear-gradient(135deg, ${DNA.blue} 0%, ${DNA.violet} 52%, ${DNA.magenta} 100%)`,
    soft: "#EFE7FF",
    text: "#4A16B8",
  },
  {
    gradient: `linear-gradient(135deg, ${DNA.blue} 0%, ${DNA.violet} 52%, ${DNA.magenta} 100%)`,
    soft: "#EFE7FF",
    text: "#4A16B8",
  },
];

function accentForScope(_scopeId: number | null, _workspace: string) {
  return dashboardAccents[0];
}

function workerOverviewPath(role?: string | null) {
  const normalized = String(role || "").toUpperCase();
  if (normalized === "PHARMACIST") return "/dashboard/pharmacist/overview";
  if (normalized === "OTHER_STAFF") return "/dashboard/otherstaff/overview";
  if (normalized === "EXPLORER") return "/dashboard/explorer/overview";
  if (normalized === "OWNER") return "/dashboard/owner/overview";
  return "/dashboard";
}

function collectPharmacies(user: any, adminAssignments: any[]): PharmacyOption[] {
  const byId = new Map<number, PharmacyOption>();
  const add = (idRaw: unknown, nameRaw: unknown, helper?: string) => {
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) return;
    const name = typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : `Pharmacy #${id}`;
    if (!byId.has(id)) byId.set(id, { id, name, helper });
  };

  // Owner authority comes from OWNER-level admin rows; the owner's own membership is a CONTACT membership.
  const ownedIds = new Set(
    (adminAssignments ?? [])
      .filter((assignment) => String(assignment?.admin_level ?? "").toUpperCase() === "OWNER")
      .map((assignment) => Number(assignment?.pharmacy_id)),
  );
  const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
  memberships.forEach((membership: any) => {
    const role = String(membership?.role ?? "").toUpperCase();
    const pharmacyId = Number(membership?.pharmacy_id ?? membership?.pharmacyId ?? membership?.pharmacy?.id);
    const employmentType = String(membership?.employment_type ?? membership?.employmentType ?? "").toUpperCase();
    if (isInternalPharmacyMembership(membership)) {
      add(
        membership?.pharmacy_id ?? membership?.pharmacyId ?? membership?.pharmacy?.id,
        membership?.pharmacy_name ?? membership?.pharmacyName ?? membership?.pharmacy?.name,
        role === "OWNER" || role === "PHARMACY_OWNER" || membership?.is_pharmacy_owner === true || ownedIds.has(pharmacyId)
          ? "Owner"
          : employmentType === "LOCUM"
            ? "Locum"
            : employmentType === "SHIFT_HERO"
              ? "Shift Hero"
              : membership?.role
      );
    }
    if (canAccessOrganizationPharmacies(membership) && Array.isArray(membership?.pharmacies)) {
      membership.pharmacies.forEach((pharmacy: any) => add(pharmacy?.id, pharmacy?.name, "Organization pharmacy"));
    }
  });

  adminAssignments.forEach((assignment: any) => {
    add(assignment?.pharmacy_id, assignment?.pharmacy_name, assignment?.admin_level ?? "Admin assignment");
  });

  const ownerPharmacies = [user?.pharmacies, user?.owner_pharmacies, user?.owned_pharmacies].find(Array.isArray) ?? [];
  ownerPharmacies.forEach((pharmacy: any) => {
    add(pharmacy?.id, pharmacy?.name, "Owner");
  });

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function MegaMenu({
  anchorEl,
  open,
  onClose,
  selectedPharmacyId,
}: {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  selectedPharmacyId: number | null;
}) {
  const nav = useDashboardNavigation();
  const navigate = useNavigate();
  const location = useLocation();

  const groups = useMemo(() => {
    const result: Array<{ title: string; items: Array<{ label: string; icon?: ReactNode; path: string; child?: boolean }> }> = [];
    let current: { title: string; items: Array<{ label: string; icon?: ReactNode; path: string; child?: boolean }> } | null = null;

    const addItem = (item: any, parentPath = "") => {
      if (item?.kind === "header") {
        current = { title: item.title, items: [] };
        result.push(current);
        return;
      }
      if (item?.kind === "divider") {
        current = null;
        return;
      }
      if (!item?.segment || !item?.title) return;
      if (!current) {
        current = { title: "Navigation", items: [] };
        result.push(current);
      }
      const path = normalizeDashboardSegment(parentPath, item);
      current.items.push({ label: item.title, icon: item.icon, path });
      if (Array.isArray(item.children)) {
        item.children.forEach((child: any) => {
          const childPath = normalizeDashboardSegment(path, child);
          current?.items.push({ label: child.title, icon: child.icon, path: childPath, child: true });
        });
      }
    };

    nav.forEach((item: any) => addItem(item));
    return result.filter((group) => group.items.length > 0);
  }, [nav]);

  const handleNavigate = (path: string) => {
    navigate(addDashboardScopeParams(path, selectedPharmacyId));
    onClose();
  };

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            mt: { xs: 0.5, md: 1 },
            width: { xs: "calc(100vw - 16px)", md: "min(1460px, calc(100vw - 24px))" },
            maxWidth: "none",
            maxHeight: { xs: "calc(100dvh - 96px)", md: "calc(100dvh - 112px)" },
            borderRadius: { xs: "0 22px 22px 0", md: "0 30px 30px 0" },
            border: "1px solid var(--ct-border-color)",
            boxShadow: "0 28px 70px rgba(2, 18, 44, 0.16)",
            overflowX: "hidden",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
          },
        },
        list: {
          sx: { p: 0 },
        },
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "repeat(4, minmax(0, 1fr))" },
          gap: { xs: 1.25, md: 2 },
          p: { xs: 1, md: 2 },
          bgcolor: "var(--ct-elevated-bg)",
        }}
      >
        {groups.map((group) => (
          <Box key={group.title} sx={{ border: "1px solid var(--ct-border-color)", bgcolor: "var(--ct-page-bg)", borderRadius: { xs: 2.5, md: 3 }, p: { xs: 1, md: 1.5 } }}>
            <Typography sx={{ px: 1, pb: 1, fontSize: 10, fontWeight: 900, letterSpacing: "0.16em", color: "var(--ct-text-secondary)", textTransform: "uppercase" }}>
              {group.title}
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {group.items.map((item) => {
                const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                return (
                  <Button
                    key={`${group.title}-${item.path}-${item.label}`}
                    onClick={() => handleNavigate(item.path)}
                    startIcon={item.icon}
                    endIcon={item.child ? undefined : null}
                    sx={{
                      width: { xs: "100%", sm: "auto" },
                      minHeight: { xs: 42, md: 46 },
                      justifyContent: "flex-start",
                      borderRadius: 2,
                      px: 1.5,
                      py: 1,
                      textTransform: "none",
                      fontSize: { xs: 12.5, md: 13 },
                      fontWeight: 900,
                      lineHeight: 1.2,
                      color: active ? "var(--ct-dashboard-accent)" : item.child ? "var(--ct-text-secondary)" : "var(--ct-text-primary)",
                      bgcolor: active ? "var(--ct-dashboard-soft)" : item.child ? "var(--ct-hover-bg)" : "var(--ct-surface-bg)",
                      border: `1px solid ${active ? "#C4B5FD" : "transparent"}`,
                      boxShadow: item.child ? "none" : "0 4px 14px rgba(6,18,58,0.05)",
                      "&:hover": {
                        bgcolor: active ? "var(--ct-dashboard-soft)" : "var(--ct-surface-bg)",
                        borderColor: "var(--ct-border-color)",
                        transform: "translateY(-1px)",
                      },
                      "& .MuiButton-startIcon": { color: active ? "var(--ct-dashboard-accent)" : "var(--ct-text-secondary)", mr: 0.75 },
                    }}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </Stack>
          </Box>
        ))}
      </Box>
      <Divider />
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2.5, py: 1.5 }}>
        <Button size="small" onClick={onClose} sx={{ textTransform: "none", fontWeight: 900, color: DNA.muted }}>
          Collapse menu
        </Button>
      </Stack>
    </Menu>
  );
}

export default function DashboardTopShell({
  children,
  titleOverride,
  forceAdminScope = false,
}: {
  children: ReactNode;
  titleOverride?: string;
  forceAdminScope?: boolean;
}) {
  const {
    user,
    activePersona,
    adminAssignments,
    activeAdminPharmacyId,
    isAdminUser,
    selectRolePersona,
    selectAdminPersona,
    setActivePersona,
  } = useAuth();
  const {
    workspace,
    setWorkspace,
    canUseInternal,
    selectedPharmacyId: workspaceSelectedPharmacyId,
    setSelectedPharmacyId: setWorkspacePharmacyId,
  } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [workspaceAnchor, setWorkspaceAnchor] = useState<HTMLElement | null>(null);
  const [adminAnchor, setAdminAnchor] = useState<HTMLElement | null>(null);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<number | null>(activeAdminPharmacyId ?? workspaceSelectedPharmacyId ?? null);
  const [workerVerified, setWorkerVerified] = useState<boolean>(() => hasVerifiedWorkerProfile(user));
  const [otherStaffRoleType, setOtherStaffRoleType] = useState<string | null>(() => {
    return (user as any)?.other_staff_profile?.role_type ?? (user as any)?.otherStaffProfile?.roleType ?? null;
  });

  const [organizationPharmacies, setOrganizationPharmacies] = useState<PharmacyOption[]>([]);
  const [authorizedOwnerPharmacies, setAuthorizedOwnerPharmacies] = useState<PharmacyOption[] | null>(null);
  const organizationId = getOrganizationMembership(user)?.organization_id;
  useEffect(() => {
    if (!organizationId) {
      setOrganizationPharmacies([]);
      return;
    }
    let active = true;
    setOrganizationPharmacies([]);
    fetchAccessibleOrganizationPharmacies(organizationId)
      .then((items) => { if (active) setOrganizationPharmacies(items); })
      .catch(() => { if (active) setOrganizationPharmacies([]); });
    return () => { active = false; };
  }, [organizationId]);
  // The pharmacy API is the source of truth for accessible locations. OWNER admin rows are
  // a subset of that list on some older accounts and must not silently hide legitimate locations.
  useEffect(() => {
    if (String(user?.role || "").toUpperCase() !== "OWNER") {
      setAuthorizedOwnerPharmacies(null);
      return;
    }
    let active = true;
    setAuthorizedOwnerPharmacies(null);
    fetchPharmaciesService({})
      .then((items) => {
        if (!active) return;
        setAuthorizedOwnerPharmacies((items || [])
          .map((item: any) => ({ id: Number(item.id), name: String(item.name || "").trim() }))
          .filter((item) => Number.isFinite(item.id) && item.id > 0 && Boolean(item.name)));
      })
      .catch(() => { if (active) setAuthorizedOwnerPharmacies(null); });
    return () => { active = false; };
  }, [user?.id, user?.role]);

  const ownedPharmacyIds = useMemo(() => {
    const ids = new Set<number>();
    const add = (id: unknown) => { const number = Number(id); if (Number.isFinite(number) && number > 0) ids.add(number); };
    (user?.memberships ?? []).forEach((membership: any) => {
      if (["OWNER", "PHARMACY_OWNER"].includes(String(membership?.role || "").toUpperCase()) || membership?.is_pharmacy_owner === true) {
        add(membership.pharmacy_id ?? membership.pharmacyId ?? membership.pharmacy?.id);
      }
    });
    adminAssignments.filter((assignment) => String(assignment.admin_level || "").toUpperCase() === "OWNER")
      .forEach((assignment) => add(assignment.pharmacy_id));
    for (const key of ["owned_pharmacies", "owner_pharmacies"]) {
      const list = (user as any)?.[key];
      if (Array.isArray(list)) list.forEach((item: any) => add(item?.id));
    }
    return ids;
  }, [user, adminAssignments]);

  const pharmacies = useMemo(() => {
    const byId = new Map(collectPharmacies(user, adminAssignments).map((item) => [item.id, item]));
    organizationPharmacies.forEach((item) => byId.set(item.id, { ...item, helper: "Organization pharmacy" }));
    // The server-authorised list includes all owned and delegated pharmacies. Keep delegated
    // assignments visible but route their selection through the existing Admin persona.
    if (String(user?.role || "").toUpperCase() === "OWNER" && authorizedOwnerPharmacies !== null) {
      const authorised = new Set(authorizedOwnerPharmacies.map((item) => item.id));
      return authorizedOwnerPharmacies.map((item) => ({
        ...item,
        helper: ownedPharmacyIds.has(item.id) ? "Owner" :
          adminAssignments.some((assignment) => Number(assignment.pharmacy_id) === item.id && isAdminPersonaAssignment(assignment))
            ? "Admin access" : byId.get(item.id)?.helper ?? "Accessible pharmacy",
      })).filter((item) => authorised.has(item.id)).sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [user, adminAssignments, organizationPharmacies, authorizedOwnerPharmacies, ownedPharmacyIds]);
  const isOrgUser = hasOrganizationAccess(user);
  const isOwner = String(user?.role || "").toUpperCase() === "OWNER";
  const isWorker = ["PHARMACIST", "OTHER_STAFF"].includes(String(user?.role || "").toUpperCase());
  // Owners and explorers can also hold a delegated admin assignment at another pharmacy; they switch the same way.
  const hasOwnPersona = isWorker || ["OWNER", "EXPLORER"].includes(String(user?.role || "").toUpperCase());
  const delegatedAdminAssignments = useMemo(
    () => adminAssignments.filter((assignment) => isAdminPersonaAssignment(assignment)),
    [adminAssignments],
  );
  const isFavoriteStaff = useMemo(() => hasFavoriteStaffMembership(user), [user]);
  const canUsePlatformWorkspace = isWorker && (workerVerified || isFavoriteStaff) && activePersona !== "admin" && !forceAdminScope;
  const hidePharmacyScope = forceAdminScope || activePersona === "admin";
  const showPharmacySelector = !hidePharmacyScope && (isOwner || isOrgUser || isWorker) && (pharmacies.length > 0 || canUsePlatformWorkspace);
  const selectedPharmacy = pharmacies.find((item) => item.id === selectedPharmacyId) ?? null;
  const title = titleOverride ?? dashboardTitleForRole(forceAdminScope ? "ADMIN" : user?.role, otherStaffRoleType);
  const accent = accentForScope(selectedPharmacyId, forceAdminScope ? "internal" : workspace);
  const dashboardHomePath =
    forceAdminScope && activeAdminPharmacyId
      ? `/dashboard/admin/${activeAdminPharmacyId}/overview`
      : isOrgUser && location.pathname.startsWith("/dashboard/organization/")
        ? "/dashboard/organization/overview"
        : workerOverviewPath(user?.role);

  useEffect(() => {
    const initialVerified = hasVerifiedWorkerProfile(user);
    setWorkerVerified(initialVerified);

    if (!user || !isWorker) return;

    let cancelled = false;
    const roleKey = String(user.role).toUpperCase() === "PHARMACIST" ? "pharmacist" : "other_staff";

    getOnboardingDetail(roleKey)
      .then((onboarding: any) => {
        if (cancelled) return;
        setWorkerVerified(hasVerifiedWorkerProfile(onboarding));
        if (roleKey === "other_staff") {
          const roleType = onboarding?.role_type ?? onboarding?.data?.role_type ?? null;
          setOtherStaffRoleType(roleType);
        }
      })
      .catch(() => {
        if (!cancelled) setWorkerVerified(initialVerified);
      });

    return () => {
      cancelled = true;
    };
  }, [isWorker, user]);

  useEffect(() => {
    if (hidePharmacyScope) return;
    const rawPharmacyId =
      searchParams.get("pharmacy_id") ??
      searchParams.get("pharmacy") ??
      searchParams.get("pharmacyId");
    const nextPharmacyId = Number(rawPharmacyId);
    if (Number.isFinite(nextPharmacyId) && pharmacies.some((pharmacy) => pharmacy.id === nextPharmacyId)) {
      setWorkspace("internal");
      setSelectedPharmacyId(nextPharmacyId);
      setWorkspacePharmacyId(nextPharmacyId);
    }
  }, [hidePharmacyScope, pharmacies, searchParams, setWorkspace, setWorkspacePharmacyId]);

  useEffect(() => {
    if (hidePharmacyScope || workspace === "platform") return;
    if (workspaceSelectedPharmacyId != null && workspaceSelectedPharmacyId !== selectedPharmacyId) {
      setSelectedPharmacyId(workspaceSelectedPharmacyId);
    }
  }, [hidePharmacyScope, selectedPharmacyId, workspace, workspaceSelectedPharmacyId]);

  useEffect(() => {
    if (canUsePlatformWorkspace || workspace !== "platform") return;
    setWorkspace("internal");
    // A valid pharmacy already named in the URL (for example a canonicalised stale link) wins over remembered state.
    const urlPharmacyId = Number(searchParams.get("pharmacy_id") ?? searchParams.get("pharmacy"));
    const urlPharmacy = pharmacies.some((pharmacy) => pharmacy.id === urlPharmacyId) ? urlPharmacyId : null;
    const fallbackPharmacyId = isOrgUser ? null : urlPharmacy ?? selectedPharmacyId ?? workspaceSelectedPharmacyId ?? pharmacies[0]?.id ?? null;
    setSelectedPharmacyId(fallbackPharmacyId);
    setWorkspacePharmacyId(fallbackPharmacyId);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("workspace", "internal");
    nextParams.delete("pharmacy_id");
    nextParams.delete("pharmacy");
    if (fallbackPharmacyId != null) {
      nextParams.set("pharmacy_id", String(fallbackPharmacyId));
    }
    setSearchParams(nextParams, { replace: true });
  }, [
    canUsePlatformWorkspace,
    isOrgUser,
    pharmacies,
    searchParams,
    selectedPharmacyId,
    setSearchParams,
    setWorkspace,
    setWorkspacePharmacyId,
    workspace,
    workspaceSelectedPharmacyId,
  ]);

  useEffect(() => {
    if (hidePharmacyScope) {
      setSelectedPharmacyId(activeAdminPharmacyId ?? null);
      setWorkspacePharmacyId(activeAdminPharmacyId ?? null);
      return;
    }
    if (workspace === "platform") {
      setSelectedPharmacyId(null);
      setWorkspacePharmacyId(null);
      return;
    }
    if (!isOrgUser && selectedPharmacyId == null && pharmacies[0]) {
      setSelectedPharmacyId(pharmacies[0].id);
      setWorkspacePharmacyId(pharmacies[0].id);
    }
  }, [activeAdminPharmacyId, hidePharmacyScope, isOrgUser, pharmacies, selectedPharmacyId, setWorkspacePharmacyId, workspace]);

  const applyScopeToCurrentUrl = (pharmacyId: number | null) => {
    const scoped = addDashboardScopeParams(`${location.pathname}?${searchParams.toString()}`, pharmacyId);
    const [, query = ""] = scoped.split("?");
    const nextParams = new URLSearchParams(query);
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  };

  const handleSelectPlatform = () => {
    if (!canUsePlatformWorkspace) {
      setWorkspaceAnchor(null);
      return;
    }
    setWorkspace("platform");
    setSelectedPharmacyId(null);
    setWorkspacePharmacyId(null);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("workspace", "platform");
    nextParams.delete("pharmacy_id");
    nextParams.delete("pharmacy");
    nextParams.delete("pharmacyId");
    nextParams.delete("view");
    setSearchParams(nextParams, { replace: true });
    setWorkspaceAnchor(null);
  };

  const handleSelectPharmacy = (id: number) => {
    if (!pharmacies.some((pharmacy) => pharmacy.id === id)) return;
    // A delegated assignment has its own capability-gated Admin workspace. Do not
    // silently treat it as Owner authority when selecting from the combined list.
    if (isOwner && !ownedPharmacyIds.has(id)) {
      const assignment = delegatedAdminAssignments.find((row) => Number(row.pharmacy_id) === id && row.id != null);
      if (assignment?.id != null) {
        selectAdminPersona(assignment.id);
        setWorkspaceAnchor(null);
        navigate(`/dashboard/admin/${id}/overview`);
        return;
      }
    }
    setWorkspace("internal");
    setSelectedPharmacyId(id);
    setWorkspacePharmacyId(id);
    applyScopeToCurrentUrl(id);
    setWorkspaceAnchor(null);
  };

  const handleSelectAllOrganizationPharmacies = () => {
    setWorkspace("internal");
    setSelectedPharmacyId(null);
    setWorkspacePharmacyId(null);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("workspace", "internal");
    nextParams.delete("pharmacy_id");
    nextParams.delete("pharmacy");
    nextParams.delete("pharmacyId");
    nextParams.delete("view");
    setSearchParams(nextParams, { replace: true });
    setWorkspaceAnchor(null);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box
        sx={{
          "--ct-dashboard-gradient": accent.gradient,
          "--ct-dashboard-soft": accent.soft,
          "--ct-dashboard-accent": accent.text,
          "--ct-dashboard-card-bg": "#FFFFFF",
          "--ct-dashboard-card-border": "#E5ECF7",
          "--ct-dashboard-card-shadow": "0 8px 24px rgba(6, 18, 58, 0.04)",
          "--ct-dashboard-card-shadow-hover": "0 18px 42px rgba(6, 18, 58, 0.10)",
          "--ct-dashboard-icon-bg": "#EFE7FF",
          "--ct-dashboard-title": DNA.ink,
          "--ct-dashboard-muted": DNA.muted,
          minHeight: "100vh",
          width: "100%",
          minWidth: 0,
          maxWidth: "100%",
          overflowX: "clip",
          bgcolor: "var(--ct-page-bg)",
          color: "var(--ct-text-primary)",
          fontFamily: "var(--ct-font-body)",
          position: "relative",
          isolation: "isolate",
          "&::before": {
            content: '""',
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(circle at 0% 0%, rgba(20,62,234,0.08) 0, transparent 28%), radial-gradient(circle at 100% 0%, rgba(234,10,142,0.08) 0, transparent 28%), radial-gradient(circle at 50% 100%, rgba(8,190,234,0.06) 0, transparent 24%)",
            zIndex: -2,
          },
          "&::after": {
            content: '""',
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 22%, rgba(255,255,255,0.1) 100%)",
            zIndex: -1,
          },
        }}
      >
      <Box
        component="header"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 1200,
          display: "flex",
          justifyContent: "center",
          alignItems: "stretch",
          minWidth: 0,
          maxWidth: "100%",
          minHeight: { xs: 72, md: 85 },
          background: "rgba(255,255,255,0.93)",
          backdropFilter: "blur(15px)",
          borderBottom: "1px solid #EDF0F5",
          boxShadow: "0 6px 18px rgba(6,18,58,0.035)",
        }}
      >
        <Stack
          direction="row"
          alignItems="stretch"
          justifyContent="center"
          sx={{
            width: "100%",
            maxWidth: 1660,
            minWidth: 0,
            boxSizing: "border-box",
            minHeight: { xs: 72, md: 85 },
            px: { xs: 1.5, sm: 2.25, md: 2.5, xl: 4 },
          }}
        >
        <Box
          sx={{
            width: { xs: 112, md: 132 },
            flex: "0 0 auto",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Button
            onClick={() => navigate(dashboardHomePath)}
            aria-label="ChemistTasker dashboard home"
            sx={{
              width: "100%",
              minWidth: 0,
              minHeight: 44,
              p: 0,
              justifyContent: "flex-start",
              borderRadius: 1.5,
              "&:hover": { bgcolor: "transparent", opacity: 0.88 },
              "&:focus-visible": {
                outline: "3px solid rgba(0,141,219,.28)",
                outlineOffset: 3,
              },
            }}
          >
            <Box
              component="img"
              src={menuLogo}
              alt="ChemistTasker"
              sx={{
                display: "block",
                width: { xs: 112, md: 132 },
                height: "auto",
                objectFit: "contain",
              }}
            />
          </Button>
        </Box>
        <MegaMenu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
          selectedPharmacyId={selectedPharmacyId}
        />

        <Box
          sx={{
            minWidth: 0,
            flex: 1,
            display: "grid",
            gridTemplateColumns: {
              xs: "minmax(0, 1fr) auto",
              md: "minmax(0, 1fr) auto",
              lg: "minmax(210px, 300px) minmax(0, 1fr) minmax(0, auto)",
              xl: "minmax(280px, 360px) minmax(0, 1fr) minmax(0, auto)",
            },
            gridTemplateAreas: {
              xs: '"scope actions"',
              md: '"scope actions"',
              lg: '"scope title actions"',
            },
            alignItems: "center",
            columnGap: { xs: 0.75, md: 1.25, xl: 2 },
            px: { xs: 0.75, md: 1.5, xl: 2.5 },
            minHeight: { xs: 72, md: 85 },
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent={{ xs: "flex-start", md: "flex-end" }}
            spacing={1}
            sx={{
              gridArea: "scope",
              minWidth: 0,
              maxWidth: "100%",
              overflowX: "auto",
              overflowY: "hidden",
              scrollbarWidth: "none",
              "&::-webkit-scrollbar": { display: "none" },
            }}
          >
          <IconButton
            aria-label="Open dashboard navigation"
            aria-expanded={Boolean(menuAnchor)}
            onClick={(event) => setMenuAnchor(event.currentTarget)}
            sx={{
              display: { xs: "inline-flex", lg: "none" },
              width: 44,
              height: 44,
              flex: "0 0 auto",
              color: "var(--ct-text-primary)",
              border: "1px solid var(--ct-border-color)",
              bgcolor: "var(--ct-surface-bg)",
              "&:hover": { bgcolor: "var(--ct-hover-bg)" },
              "&:focus-visible": {
                outline: "3px solid rgba(0,141,219,.28)",
                outlineOffset: 1,
              },
            }}
          >
            <MenuRoundedIcon />
          </IconButton>
          {showPharmacySelector && (
            <>
              <Button
                onClick={(event) => setWorkspaceAnchor(event.currentTarget)}
                aria-label={`Select pharmacy workspace. ${selectedPharmacy?.name ?? "No pharmacy selected"}. ${pharmacies.length} locations available`}
                aria-expanded={Boolean(workspaceAnchor)}
                aria-haspopup="menu"
                startIcon={selectedPharmacy ? <StoreIcon /> : <PublicIcon />}
                endIcon={<KeyboardArrowDownIcon />}
                sx={{
                  height: { xs: 48, md: 58 },
                  minWidth: 0,
                  width: { xs: 176, sm: 220, md: 260, lg: 250, xl: 300 },
                  maxWidth: "100%",
                  flexShrink: 1,
                  justifyContent: "flex-start",
                  borderRadius: { xs: "14px", md: "18px" },
                  border: "1px solid var(--ct-border-color)",
                  bgcolor: "var(--ct-surface-bg)",
                  px: { xs: 1.25, md: 2 },
                  textTransform: "none",
                  boxShadow: "0 4px 16px rgba(6,18,58,0.05)",
                }}
              >
                <Box sx={{ minWidth: 0, textAlign: "left" }}>
                  <Typography noWrap title={selectedPharmacy?.name ?? undefined} sx={{ fontSize: { xs: 12, md: 14 }, fontWeight: 900, color: "var(--ct-text-primary)" }}>
                    {selectedPharmacy?.name ?? (isOrgUser && workspace === "internal" ? "All organization pharmacies" : "ChemistTasker Platform")}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: { xs: 10, md: 12 }, fontWeight: 700, color: "var(--ct-text-secondary)" }}>
                    {selectedPharmacy ? "Selected pharmacy scope" : isOrgUser && workspace === "internal" ? "Combined organization scope" : "Public platform workspace"}
                  </Typography>
                </Box>
              </Button>
              <Menu anchorEl={workspaceAnchor} open={Boolean(workspaceAnchor)} onClose={() => setWorkspaceAnchor(null)}
                MenuListProps={{ "aria-label": "Available pharmacy workspaces" }}
                slotProps={{ paper: { sx: { width: { xs: "min(94vw, 390px)", sm: 410 }, maxWidth: "94vw", maxHeight: "min(66dvh, 520px)", borderRadius: 2.5, boxShadow: "0 16px 40px rgba(6,18,58,.14)" } } }}>
                {isOrgUser && <MenuItem onClick={handleSelectAllOrganizationPharmacies}>
                  <StoreIcon sx={{ mr: 1.5, color: DNA.blue }} /> All organization pharmacies
                </MenuItem>}
                {canUsePlatformWorkspace && canUseInternal && (
                  <MenuItem onClick={handleSelectPlatform}>
                    <PublicIcon sx={{ mr: 1.5, color: DNA.violet }} /> ChemistTasker Platform
                  </MenuItem>
                )}
                <Box component="li" role="presentation" sx={{ listStyle: "none", px: 2, pt: 1.25, pb: 0.5 }}>
                  <Typography sx={{ color: "#445474", fontWeight: 850, fontSize: 12, letterSpacing: ".04em" }}>
                    {pharmacies.length} {pharmacies.length === 1 ? "pharmacy" : "pharmacies"} available
                  </Typography>
                </Box>
                {pharmacies.map((pharmacy) => (
                  <MenuItem key={pharmacy.id} selected={selectedPharmacyId === pharmacy.id} onClick={() => handleSelectPharmacy(pharmacy.id)}
                    sx={{ gap: 1.5, py: 1.25, px: 2, whiteSpace: "normal", alignItems: "flex-start", borderRadius: 1, mx: 0.75, "&.Mui-selected": { bgcolor: "#F0ECFC" } }}>
                    <StoreIcon sx={{ flexShrink: 0, mt: 0.35, color: "#5222B8" }} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontWeight: 800, color: "#06123A", fontSize: 14, overflowWrap: "anywhere" }}>{pharmacy.name}</Typography>
                      <Typography sx={{ fontSize: 12.5, color: "#445474" }}>{pharmacy.helper ?? "Accessible pharmacy"}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}

          {hasOwnPersona && isAdminUser && (
            <Stack direction="row" alignItems="center" sx={{ height: { xs: 48, md: 58 }, border: "1px solid var(--ct-border-color)", bgcolor: "var(--ct-surface-bg)", borderRadius: 999, p: 0.5, flexShrink: 0 }}>
              <Button
                onClick={() => {
                  const role = String(user?.role).toUpperCase();
                  if (role === "PHARMACIST" || role === "OTHER_STAFF") selectRolePersona(role);
                  else setActivePersona("staff");
                  navigate(workerOverviewPath(role), { replace: true });
                }}
                sx={{
                  borderRadius: 999,
                  height: { xs: 38, md: 46 },
                  px: { xs: 1.25, md: 2 },
                  textTransform: "none",
                  fontSize: { xs: 11, md: 12 },
                  fontWeight: 900,
                  color: activePersona === "admin" ? "var(--ct-text-secondary)" : DNA.violet,
                  bgcolor: activePersona === "admin" ? "transparent" : "var(--ct-soft-primary)",
                }}
              >
                <PersonIcon sx={{ fontSize: 16, mr: 0.75 }} /> {userRoleLabel(user?.role, otherStaffRoleType)}
              </Button>
              <Button
                onClick={(event) => setAdminAnchor(event.currentTarget)}
                sx={{
                  borderRadius: 999,
                  height: { xs: 38, md: 46 },
                  px: { xs: 1.25, md: 2 },
                  textTransform: "none",
                  fontSize: { xs: 11, md: 12 },
                  fontWeight: 900,
                  color: activePersona === "admin" ? DNA.violet : "var(--ct-text-secondary)",
                  bgcolor: activePersona === "admin" ? "var(--ct-soft-primary)" : "transparent",
                }}
              >
                <AdminPanelSettingsIcon sx={{ fontSize: 16, mr: 0.75 }} /> Admin
              </Button>
              <Menu anchorEl={adminAnchor} open={Boolean(adminAnchor)} onClose={() => setAdminAnchor(null)}>
                {delegatedAdminAssignments.map((assignment) => (
                  <MenuItem
                    key={assignment.id ?? assignment.pharmacy_id}
                    onClick={() => {
                      if (assignment.id != null) selectAdminPersona(assignment.id);
                      navigate(`/dashboard/admin/${assignment.pharmacy_id}/overview`);
                      setAdminAnchor(null);
                    }}
                  >
                    <StoreIcon sx={{ mr: 1.5, color: DNA.blue }} />
                    <Box>
                      <Typography sx={{ fontWeight: 800 }}>{assignment.pharmacy_name ?? `Pharmacy #${assignment.pharmacy_id}`}</Typography>
                      <Typography sx={{ fontSize: 12, color: DNA.muted }}>{assignment.admin_level}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Menu>
            </Stack>
          )}
          </Stack>

          <Box
            sx={{
              gridArea: "title",
              minWidth: 0,
              display: { xs: "none", lg: "block" },
              textAlign: "left",
              justifySelf: "start",
              width: "100%",
              maxWidth: "100%",
            }}
          >
            <Typography noWrap sx={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: DNA.violet }}>
              {forceAdminScope ? "Internal Workspace" : workspace === "platform" ? "Public Platform" : "Internal Workspace"}
            </Typography>
            <Typography component="div" noWrap sx={{ fontFamily: "var(--ct-font-display)", fontSize: 19, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.2, color: "var(--ct-text-primary)" }}>
              {title}
            </Typography>
          </Box>

          <Stack
            direction="row"
            alignItems="center"
            justifyContent={{ xs: "flex-start", md: "flex-start" }}
            spacing={{ xs: 0.5, md: 1 }}
            sx={{
              gridArea: "actions",
              minWidth: 0,
              justifySelf: "end",
              display: "flex",
              width: { xs: "auto", md: 390, lg: 520, xl: 560 },
              maxWidth: "100%",
            }}
          >
            <TopBarActions
              iconSx={{
                width: { xs: 38, md: 46 },
                height: { xs: 38, md: 46 },
                bgcolor: "var(--ct-surface-bg)",
                color: "var(--ct-text-secondary)",
                boxShadow: "0 3px 12px rgba(6,18,58,0.05)",
                "&:hover": { bgcolor: "var(--ct-hover-bg)", color: DNA.violet },
              }}
            />
          </Stack>
        </Box>
        </Stack>
      </Box>

      <Box sx={{ display: "flex", width: "100%", minWidth: 0 }}>
        <DashboardSideNav selectedPharmacyId={selectedPharmacyId} />
        <Box
          component="main"
          sx={{
            width: "100%",
            flex: "1 1 0%",
            maxWidth: "100%",
            minWidth: 0,
            mx: "auto",
            px: { xs: 1.5, sm: 2, md: 3, xl: 4 },
            py: { xs: 2, md: 3.5 },
            overflowX: "hidden",
            position: "relative",
            zIndex: 1,
            "& .MuiPaper-root": {
              borderColor: "var(--ct-border-color)",
            },
          }}
        >
          {children}
        </Box>
      </Box>
      </Box>
    </LocalizationProvider>
  );
}
