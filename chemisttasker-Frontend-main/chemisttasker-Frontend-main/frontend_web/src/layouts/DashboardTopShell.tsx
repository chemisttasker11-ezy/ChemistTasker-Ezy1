import { ReactNode, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import {
  Box,
  Button,
  Divider,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import StoreIcon from "@mui/icons-material/Store";
import PublicIcon from "@mui/icons-material/Public";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import PersonIcon from "@mui/icons-material/Person";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { useDashboardNavigation } from "../contexts/DashboardNavigationContext";
import TopBarActions from "./TopBarActions";
import menuLogo from "../assets/clipsnap-edit-6-1-2026.png";
import { getOnboardingDetail } from "@chemisttasker/shared-core";
import { dashboardTitleForRole, userRoleLabel } from "../utils/roleLabels";

const DNA = {
  navy: "#061A3D",
  navy2: "#02122C",
  blue: "#063BDA",
  violet: "#6D28D9",
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

const PHARMACY_STAFF_EMPLOYMENT_TYPES = new Set(["FULL_TIME", "PART_TIME", "CASUAL"]);
const FAVORITE_STAFF_EMPLOYMENT_TYPES = new Set(["LOCUM", "SHIFT_HERO"]);
const INTERNAL_PHARMACY_ROLES = new Set(["OWNER", "PHARMACY_OWNER", "MANAGER", "PHARMACY_ADMIN", "ADMIN", "ROSTER_MANAGER", "COMMUNICATION_MANAGER"]);

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
  return "/dashboard";
}

function addScopedParams(path: string, selectedPharmacyId: number | null) {
  if (!selectedPharmacyId) return path;
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  const isRoster = pathname.includes("/manage-pharmacies/roster") || pathname.includes("/shifts/roster");
  const isCalendar = pathname.endsWith("/calendar");
  const isPostShift = pathname.endsWith("/post-shift");
  const isMyPharmacies = pathname.includes("/manage-pharmacies/my-pharmacies");

  params.set("workspace", "internal");
  params.set("pharmacy_id", String(selectedPharmacyId));

  if (isCalendar || isPostShift || isRoster) {
    params.set("pharmacy", String(selectedPharmacyId));
  }
  if (isMyPharmacies) {
    params.set("view", "detail");
    params.set("pharmacyId", String(selectedPharmacyId));
  }

  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function normalizeSegment(parentPath: string, item: any) {
  const segment = String(item?.segment || "").replace(/^\/+/, "");
  if (!segment) return parentPath;
  if (segment.startsWith("dashboard/")) return `/${segment}`;
  return `${parentPath.replace(/\/+$/, "")}/${segment}`.replace(/\/+/g, "/");
}

function collectPharmacies(user: any, adminAssignments: any[]): PharmacyOption[] {
  const byId = new Map<number, PharmacyOption>();
  const add = (idRaw: unknown, nameRaw: unknown, helper?: string) => {
    const id = Number(idRaw);
    if (!Number.isFinite(id)) return;
    const name = typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : `Pharmacy #${id}`;
    if (!byId.has(id)) byId.set(id, { id, name, helper });
  };

  const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
  memberships.forEach((membership: any) => {
    const role = String(membership?.role ?? "").toUpperCase();
    const employmentType = String(membership?.employment_type ?? membership?.employmentType ?? "").toUpperCase();
    if (
      !INTERNAL_PHARMACY_ROLES.has(role) &&
      !PHARMACY_STAFF_EMPLOYMENT_TYPES.has(employmentType) &&
      !FAVORITE_STAFF_EMPLOYMENT_TYPES.has(employmentType)
    ) return;
    add(
      membership?.pharmacy_id ?? membership?.pharmacyId ?? membership?.pharmacy?.id,
      membership?.pharmacy_name ?? membership?.pharmacyName ?? membership?.pharmacy?.name,
      role === "OWNER" || role === "PHARMACY_OWNER"
        ? "Owner"
        : employmentType === "LOCUM"
          ? "Locum"
          : employmentType === "SHIFT_HERO"
            ? "Shift Hero"
            : membership?.role
    );
    if (Array.isArray(membership?.pharmacies)) {
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

function hasFavoriteStaffMembership(user: any): boolean {
  const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
  return memberships.some((membership: any) => {
    const rawPharmacyId = membership?.pharmacy_id ?? membership?.pharmacyId ?? membership?.pharmacy?.id;
    const employmentType = String(membership?.employment_type ?? membership?.employmentType ?? "").toUpperCase();
    return Number.isFinite(Number(rawPharmacyId)) && FAVORITE_STAFF_EMPLOYMENT_TYPES.has(employmentType);
  });
}

function coerceVerified(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function isOverallVerified(user: any): boolean {
  return (
    coerceVerified(user?.verified) ||
    coerceVerified(user?.pharmacist_profile?.verified) ||
    coerceVerified(user?.other_staff_profile?.verified)
  );
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
      const path = normalizeSegment(parentPath, item);
      current.items.push({ label: item.title, icon: item.icon, path });
      if (Array.isArray(item.children)) {
        item.children.forEach((child: any) => {
          const childPath = normalizeSegment(path, child);
          current?.items.push({ label: child.title, icon: child.icon, path: childPath, child: true });
        });
      }
    };

    nav.forEach((item: any) => addItem(item));
    return result.filter((group) => group.items.length > 0);
  }, [nav]);

  const handleNavigate = (path: string) => {
    navigate(addScopedParams(path, selectedPharmacyId));
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
  const [workerVerified, setWorkerVerified] = useState<boolean>(() => isOverallVerified(user));
  const [otherStaffRoleType, setOtherStaffRoleType] = useState<string | null>(() => {
    return (user as any)?.other_staff_profile?.role_type ?? (user as any)?.otherStaffProfile?.roleType ?? null;
  });

  const pharmacies = useMemo(() => collectPharmacies(user, adminAssignments), [user, adminAssignments]);
  const isOrgUser = String(user?.role || "").toUpperCase().includes("ORG") || String(user?.role || "").toUpperCase() === "ORGANIZATION";
  const isOwner = String(user?.role || "").toUpperCase() === "OWNER";
  const isWorker = ["PHARMACIST", "OTHER_STAFF"].includes(String(user?.role || "").toUpperCase());
  const isFavoriteStaff = useMemo(() => hasFavoriteStaffMembership(user), [user]);
  const canUsePlatformWorkspace = isWorker && (workerVerified || isFavoriteStaff) && activePersona !== "admin" && !forceAdminScope;
  const hidePharmacyScope = forceAdminScope || activePersona === "admin";
  const showPharmacySelector = !hidePharmacyScope && (isOwner || isOrgUser || isWorker) && (pharmacies.length > 0 || canUsePlatformWorkspace);
  const selectedPharmacy = pharmacies.find((item) => item.id === selectedPharmacyId) ?? null;
  const title = titleOverride ?? dashboardTitleForRole(forceAdminScope ? "ADMIN" : user?.role, otherStaffRoleType);
  const accent = accentForScope(selectedPharmacyId, forceAdminScope ? "internal" : workspace);

  useEffect(() => {
    const initialVerified = isOverallVerified(user);
    setWorkerVerified(initialVerified);

    if (!user || !isWorker) return;

    let cancelled = false;
    const roleKey = String(user.role).toUpperCase() === "PHARMACIST" ? "pharmacist" : "other_staff";

    getOnboardingDetail(roleKey)
      .then((onboarding: any) => {
        if (cancelled) return;
        const verifiedFlag =
          onboarding?.verified ??
          onboarding?.data?.verified ??
          (roleKey === "pharmacist" ? onboarding?.ahpra_verified : undefined);
        setWorkerVerified(coerceVerified(verifiedFlag));
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
    const fallbackPharmacyId = selectedPharmacyId ?? workspaceSelectedPharmacyId ?? pharmacies[0]?.id ?? null;
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
    if (selectedPharmacyId == null && pharmacies[0]) {
      setSelectedPharmacyId(pharmacies[0].id);
      setWorkspacePharmacyId(pharmacies[0].id);
    }
  }, [activeAdminPharmacyId, hidePharmacyScope, pharmacies, selectedPharmacyId, setWorkspacePharmacyId, workspace]);

  const applyScopeToCurrentUrl = (pharmacyId: number | null) => {
    const scoped = addScopedParams(`${location.pathname}?${searchParams.toString()}`, pharmacyId);
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
    setWorkspace("internal");
    setSelectedPharmacyId(id);
    setWorkspacePharmacyId(id);
    applyScopeToCurrentUrl(id);
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
          bgcolor: "var(--ct-page-bg)",
          color: "var(--ct-text-primary)",
          fontFamily: '"DM Sans Variable", "DM Sans", "Barlow", Arial, sans-serif',
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
          minHeight: { xs: 86, md: 104 },
          background: "linear-gradient(90deg, rgba(6,59,218,0.12) 0%, rgba(109,40,217,0.11) 42%, rgba(234,10,142,0.10) 72%, rgba(8,190,234,0.10) 100%)",
          backdropFilter: "blur(18px)",
          borderBottom: "1px solid rgba(109,40,217,0.16)",
          boxShadow: "0 12px 34px rgba(6,18,58,0.07)",
          overflow: "hidden",
          "&::before": {
            content: '""',
            position: "absolute",
            left: "18%",
            top: -120,
            width: 320,
            height: 320,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 72%)",
            pointerEvents: "none",
          },
          "&::after": {
            content: '""',
            position: "absolute",
            right: -60,
            bottom: -140,
            width: 360,
            height: 360,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(139,28,246,0.18) 0%, rgba(139,28,246,0) 72%)",
            pointerEvents: "none",
          },
        }}
      >
        <Stack
          direction="row"
          alignItems="stretch"
          justifyContent="center"
          sx={{
            width: "100%",
            maxWidth: 1660,
            minHeight: { xs: 86, md: 104 },
            px: { xs: 0.75, sm: 1.5, md: 2, xl: 3 },
            overflow: "hidden",
          }}
        >
        <Button
          onClick={(event) => setMenuAnchor(event.currentTarget)}
          sx={{
            position: "relative",
            width: { xs: 84, sm: 190, md: 250, xl: 300 },
            minHeight: { xs: 86, md: 104 },
            flexShrink: 0,
            borderRadius: "0 0 30px 0",
            background: "linear-gradient(135deg, rgba(6,59,218,0.13) 0%, rgba(109,40,217,0.11) 52%, rgba(234,10,142,0.09) 100%)",
            borderRight: "1px solid rgba(109,40,217,0.16)",
            boxShadow: "0 18px 46px rgba(6, 26, 61, 0.12)",
            p: { xs: 0.75, sm: 1.25, md: 2 },
            "&:hover": {
              background: "linear-gradient(135deg, rgba(6,59,218,0.18) 0%, rgba(109,40,217,0.15) 52%, rgba(234,10,142,0.12) 100%)",
              filter: "brightness(1.02)",
            },
            "&:after": {
              content: '""',
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 4,
              background: `linear-gradient(90deg, ${DNA.violet}, ${DNA.magenta}, ${DNA.cyan})`,
            },
          }}
        >
          <Box component="img" src={menuLogo} alt="ChemistTasker menu" sx={{ maxWidth: "100%", maxHeight: { xs: 54, md: 74 }, objectFit: "contain" }} />
          <KeyboardArrowDownIcon sx={{ ml: { xs: 0.25, md: 1 }, fontSize: { xs: 18, md: 24 }, color: "var(--ct-text-primary)", transform: menuAnchor ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
        </Button>
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
              lg: "minmax(260px, 440px) minmax(210px, 1fr) auto",
              xl: "minmax(360px, 520px) minmax(260px, 1fr) auto",
            },
            gridTemplateAreas: {
              xs: '"scope actions"',
              md: '"scope actions"',
              lg: '"scope title actions"',
            },
            alignItems: "center",
            columnGap: { xs: 0.75, md: 1.25, xl: 2 },
            px: { xs: 0.75, md: 1.5, xl: 2.5 },
            minHeight: { xs: 86, md: 104 },
            overflow: "hidden",
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
          {showPharmacySelector && (
            <>
              <Button
                onClick={(event) => setWorkspaceAnchor(event.currentTarget)}
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
                  <Typography noWrap sx={{ fontSize: { xs: 12, md: 14 }, fontWeight: 900, color: "var(--ct-text-primary)" }}>
                    {selectedPharmacy?.name ?? "ChemistTasker Platform"}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: { xs: 10, md: 12 }, fontWeight: 700, color: "var(--ct-text-secondary)" }}>
                    {selectedPharmacy ? "Selected pharmacy scope" : "Public platform workspace"}
                  </Typography>
                </Box>
              </Button>
              <Menu anchorEl={workspaceAnchor} open={Boolean(workspaceAnchor)} onClose={() => setWorkspaceAnchor(null)}>
                {canUsePlatformWorkspace && canUseInternal && (
                  <MenuItem onClick={handleSelectPlatform}>
                    <PublicIcon sx={{ mr: 1.5, color: DNA.violet }} /> ChemistTasker Platform
                  </MenuItem>
                )}
                {pharmacies.map((pharmacy) => (
                  <MenuItem key={pharmacy.id} onClick={() => handleSelectPharmacy(pharmacy.id)}>
                    <StoreIcon sx={{ mr: 1.5, color: DNA.blue }} />
                    <Box>
                      <Typography sx={{ fontWeight: 800 }}>{pharmacy.name}</Typography>
                      {pharmacy.helper && <Typography sx={{ fontSize: 12, color: DNA.muted }}>{pharmacy.helper}</Typography>}
                    </Box>
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}

          {isWorker && isAdminUser && (
            <Stack direction="row" alignItems="center" sx={{ height: { xs: 48, md: 58 }, border: "1px solid var(--ct-border-color)", bgcolor: "var(--ct-surface-bg)", borderRadius: 999, p: 0.5, flexShrink: 0 }}>
              <Button
                onClick={() => {
                  const role = String(user?.role).toUpperCase() as "PHARMACIST" | "OTHER_STAFF";
                  selectRolePersona(role);
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
                {adminAssignments.map((assignment) => (
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
            <Typography noWrap sx={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: DNA.violet }}>
              {forceAdminScope ? "Internal Workspace" : workspace === "platform" ? "Public Platform" : "Internal Workspace"}
            </Typography>
            <Typography noWrap sx={{ fontSize: 18, fontWeight: 950, color: "var(--ct-text-primary)" }}>
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
              width: { xs: "auto", md: 390, lg: 420, xl: 460 },
              maxWidth: "100%",
            }}
          >
            <TopBarActions
              hideSearch
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

      <Box
        component="main"
        sx={{
          width: "100%",
          maxWidth: "1660px",
          minWidth: 0,
          mx: "auto",
          px: { xs: 1.5, sm: 2, md: 3 },
          py: { xs: 1.5, md: 3 },
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
    </LocalizationProvider>
  );
}
