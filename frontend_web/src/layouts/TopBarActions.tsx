import * as React from "react";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Badge from "@mui/material/Badge";
import Avatar from "@mui/material/Avatar";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import Popover from "@mui/material/Popover";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Box from "@mui/material/Box";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { alpha, useTheme, type SxProps, type Theme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { fetchWsTicket } from "../utils/tokenService";
import apiClient from "../utils/apiClient";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import { useNavigate } from "react-router-dom";
import { useColorMode } from "../theme/sleekTheme";
import { useAuth } from "../contexts/AuthContext";
import { fetchNotifications, markNotificationsRead, NotificationItem } from "../api/notifications";
import { fetchRooms, getOnboarding } from "@chemisttasker/shared-core";
import { API_BASE_URL } from "../constants/api";
import { dashboardGreetingName } from "../utils/displayName";
import { otherStaffRoleLabel, userRoleLabel } from "../utils/roleLabels";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

type SearchOption = {
  label: string;
  path: string;
  keywords?: string[];
  description?: string;
};

type PersonaMenuOption =
  | {
    key: string;
    kind: "ROLE";
    role: "PHARMACIST" | "OTHER_STAFF";
    label: string;
    helper?: string;
  }
  | {
    key: string;
    kind: "ADMIN";
    assignmentId: number;
    label: string;
    helper?: string;
  };

const ADMIN_LEVEL_LABELS: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  ROSTER_MANAGER: "Roster Manager",
  COMMUNICATION_MANAGER: "Communications Manager",
};

const ADMIN_STAFF_ROLE_LABELS: Record<string, string> = {
  PHARMACIST: "Pharmacist",
  INTERN: "Intern Pharmacist",
  TECHNICIAN: "Dispensary Technician",
  ASSISTANT: "Pharmacy Assistant",
  STUDENT: "Pharmacy Student",
};

const ownerOptions: SearchOption[] = [
  { label: "Overview", path: "/dashboard/owner/overview", keywords: ["home", "dashboard", "summary"] },
  {
    label: "Manage Pharmacies",
    path: "/dashboard/owner/manage-pharmacies",
    keywords: ["pharmacies", "stores", "management"],
    description: "Browse and edit your pharmacy locations",
  },
  {
    label: "Claim Requests",
    path: "/dashboard/owner/manage-pharmacies?claim=open",
    keywords: ["claim", "requests", "organization"],
  },
  {
    label: "My Chain",
    path: "/dashboard/owner/manage-pharmacies/my-chain",
    keywords: ["chain", "group", "network"],
  },
  {
    label: "Internal Roster",
    path: "/dashboard/owner/manage-pharmacies/roster",
    keywords: ["schedule", "roster", "staffing"],
  },
  {
    label: "Post a Shift",
    path: "/dashboard/owner/post-shift",
    keywords: ["create shift", "new shift", "shift posting"],
  },
  {
    label: "Public Shifts",
    path: "/dashboard/owner/shifts/public",
    keywords: ["public shifts", "available shifts"],
  },
  {
    label: "Community Shifts",
    path: "/dashboard/owner/shifts/community",
    keywords: ["community", "shared shifts"],
  },
  {
    label: "Active Shifts",
    path: "/dashboard/owner/shift-center/active",
    keywords: ["active shifts", "current shifts"],
  },
  {
    label: "Confirmed Shifts",
    path: "/dashboard/owner/shift-center/confirmed",
    keywords: ["confirmed", "booked shifts"],
  },
  {
    label: "Shift History",
    path: "/dashboard/owner/shift-center/history",
    keywords: ["past shifts", "history"],
  },
  {
    label: "Profile & Onboarding",
    path: "/dashboard/owner/onboarding",
    keywords: ["profile", "onboarding", "setup"],
  },
  {
    label: "Chat",
    path: "/dashboard/owner/chat",
    keywords: ["messages", "inbox", "communication"],
  },
  {
    label: "Talent Hub",
    path: "/dashboard/owner/interests",
    keywords: ["interests", "explore", "resources"],
  },
  {
    label: "Learning Materials",
    path: "/dashboard/owner/learning",
    keywords: ["learning", "training", "education"],
  },
  {
    label: "Logout",
    path: "/dashboard/owner/logout",
    keywords: ["sign out", "log out"],
  },
];

const organizationOptions: SearchOption[] = [
  { label: "Overview", path: "/dashboard/organization/overview", keywords: ["home", "dashboard", "summary"] },
  {
    label: "Invite Staff",
    path: "/dashboard/organization/invite",
    keywords: ["invite", "staff", "team"],
  },
  {
    label: "Claim Pharmacies",
    path: "/dashboard/organization/manage-pharmacies?claim=open",
    keywords: ["claim", "pharmacies", "organization"],
  },
  {
    label: "Manage Pharmacies",
    path: "/dashboard/organization/manage-pharmacies",
    keywords: ["manage", "pharmacies", "stores"],
  },
  {
    label: "My Pharmacies",
    path: "/dashboard/organization/manage-pharmacies/my-pharmacies",
    keywords: ["locations", "branches", "pharmacy list"],
  },
  {
    label: "My Chain",
    path: "/dashboard/organization/manage-pharmacies/my-chain",
    keywords: ["chain", "group", "network"],
  },
  {
    label: "Internal Roster",
    path: "/dashboard/organization/manage-pharmacies/roster",
    keywords: ["roster", "schedule", "staffing"],
  },
  {
    label: "Post a Shift",
    path: "/dashboard/organization/post-shift",
    keywords: ["create shift", "new shift"],
  },
  {
    label: "Public Shifts",
    path: "/dashboard/organization/shifts/public",
    keywords: ["public shifts", "availability"],
  },
  {
    label: "Community Shifts",
    path: "/dashboard/organization/shifts/community",
    keywords: ["community", "shared"],
  },
  {
    label: "Active Shifts",
    path: "/dashboard/organization/shift-center/active",
    keywords: ["active shifts", "current"],
  },
  {
    label: "Confirmed Shifts",
    path: "/dashboard/organization/shift-center/confirmed",
    keywords: ["confirmed", "booked"],
  },
  {
    label: "Shift History",
    path: "/dashboard/organization/shift-center/history",
    keywords: ["history", "past shifts"],
  },
  {
    label: "Chat",
    path: "/dashboard/organization/chat",
    keywords: ["messages", "inbox"],
  },
  {
    label: "Talent Hub",
    path: "/dashboard/organization/interests",
    keywords: ["interests", "resources"],
  },
  {
    label: "Learning Materials",
    path: "/dashboard/organization/learning",
    keywords: ["learning", "training"],
  },
  {
    label: "Logout",
    path: "/dashboard/organization/logout",
    keywords: ["sign out", "log out"],
  },
];

const pharmacistOptions: SearchOption[] = [
  { label: "Overview", path: "/dashboard/pharmacist/overview", keywords: ["home", "dashboard", "summary"] },
  {
    label: "Public Shifts",
    path: "/dashboard/pharmacist/shifts/public",
    keywords: ["public shifts", "available shifts"],
  },
  {
    label: "Community Shifts",
    path: "/dashboard/pharmacist/shifts/community",
    keywords: ["community", "platform shifts"],
  },
  {
    label: "My Confirmed Shifts",
    path: "/dashboard/pharmacist/shifts/confirmed",
    keywords: ["confirmed", "booked shifts"],
  },
  {
    label: "My Shift History",
    path: "/dashboard/pharmacist/shifts/history",
    keywords: ["past shifts", "history"],
  },
  {
    label: "My Roster",
    path: "/dashboard/pharmacist/shifts/roster",
    keywords: ["roster", "schedule", "internal"],
  },
  {
    label: "Profile & Onboarding",
    path: "/dashboard/pharmacist/onboarding",
    keywords: ["profile", "onboarding", "setup"],
  },
  {
    label: "Set Availability",
    path: "/dashboard/pharmacist/availability",
    keywords: ["availability", "calendar", "schedule"],
  },
  {
    label: "Publish Availability",
    path: "/dashboard/pharmacist/interests?publish_availability=1",
    keywords: ["publish availability", "pitch", "talent board", "post availability"],
  },
  {
    label: "Invoices",
    path: "/dashboard/pharmacist/invoice",
    keywords: ["invoice", "billing", "payments"],
  },
  {
    label: "Create Invoice",
    path: "/dashboard/pharmacist/invoice/new",
    keywords: ["invoice", "new invoice", "billing"],
  },
  {
    label: "Chat",
    path: "/dashboard/pharmacist/chat",
    keywords: ["messages", "inbox", "communication"],
  },
  {
    label: "Talent Hub",
    path: "/dashboard/pharmacist/interests",
    keywords: ["interests", "explore", "resources"],
  },
  {
    label: "Learning Materials",
    path: "/dashboard/pharmacist/learning",
    keywords: ["learning", "training", "education"],
  },
  {
    label: "Logout",
    path: "/dashboard/pharmacist/logout",
    keywords: ["sign out", "log out"],
  },
];

const otherStaffOptions: SearchOption[] = [
  { label: "Overview", path: "/dashboard/otherstaff/overview", keywords: ["home", "dashboard", "summary"] },
  {
    label: "Public Shifts",
    path: "/dashboard/otherstaff/shifts/public",
    keywords: ["public shifts", "available"],
  },
  {
    label: "Community Shifts",
    path: "/dashboard/otherstaff/shifts/community",
    keywords: ["community", "platform shifts"],
  },
  {
    label: "My Confirmed Shifts",
    path: "/dashboard/otherstaff/shifts/confirmed",
    keywords: ["confirmed", "booked shifts"],
  },
  {
    label: "My Shift History",
    path: "/dashboard/otherstaff/shifts/history",
    keywords: ["past shifts", "history"],
  },
  {
    label: "My Roster",
    path: "/dashboard/otherstaff/shifts/roster",
    keywords: ["roster", "schedule"],
  },
  {
    label: "Profile & Onboarding",
    path: "/dashboard/otherstaff/onboarding",
    keywords: ["profile", "onboarding"],
  },
  {
    label: "Set Availability",
    path: "/dashboard/otherstaff/availability",
    keywords: ["availability", "calendar"],
  },
  {
    label: "Publish Availability",
    path: "/dashboard/otherstaff/interests?publish_availability=1",
    keywords: ["publish availability", "pitch", "talent board", "post availability"],
  },
  {
    label: "Invoices",
    path: "/dashboard/otherstaff/invoice",
    keywords: ["invoice", "billing"],
  },
  {
    label: "Chat",
    path: "/dashboard/otherstaff/chat",
    keywords: ["messages", "inbox"],
  },
  {
    label: "Talent Hub",
    path: "/dashboard/otherstaff/interests",
    keywords: ["interests", "resources"],
  },
  {
    label: "Learning Materials",
    path: "/dashboard/otherstaff/learning",
    keywords: ["learning", "training"],
  },
  {
    label: "Logout",
    path: "/dashboard/otherstaff/logout",
    keywords: ["sign out", "log out"],
  },
];

const explorerOptions: SearchOption[] = [
  { label: "Overview", path: "/dashboard/explorer/overview", keywords: ["home", "dashboard", "summary"] },
  {
    label: "Profile & Onboarding",
    path: "/dashboard/explorer/onboarding",
    keywords: ["profile", "onboarding"],
  },
  {
    label: "Public Shifts",
    path: "/dashboard/explorer/shifts/public",
    keywords: ["public shifts", "browse"],
  },
  {
    label: "Community Shifts",
    path: "/dashboard/explorer/shifts/community",
    keywords: ["community", "platform shifts"],
  },
  {
    label: "Chat",
    path: "/dashboard/explorer/chat",
    keywords: ["messages", "inbox"],
  },
  {
    label: "Talent Hub",
    path: "/dashboard/explorer/interests",
    keywords: ["interests", "resources"],
  },
  {
    label: "Learning Materials",
    path: "/dashboard/explorer/learning",
    keywords: ["learning", "training"],
  },
  {
    label: "Logout",
    path: "/dashboard/explorer/logout",
    keywords: ["sign out", "log out"],
  },
];

const defaultOptions: SearchOption[] = Array.from(
  new Map(
    [...ownerOptions, ...organizationOptions, ...pharmacistOptions, ...otherStaffOptions, ...explorerOptions].map((option) => [
      option.path,
      option,
    ])
  ).values()
);

const ROLE_SEARCH_OPTIONS: Record<string, SearchOption[]> = {
  OWNER: ownerOptions,
  PHARMACY_ADMIN: ownerOptions,
  ORG_ADMIN: organizationOptions,
  ORG_OWNER: organizationOptions,
  ORG_STAFF: organizationOptions,
  ORGANIZATION: organizationOptions,
  PHARMACIST: pharmacistOptions,
  OTHER_STAFF: otherStaffOptions,
  EXPLORER: explorerOptions,
  DEFAULT: defaultOptions,
};

const CHAT_ROUTES: Record<string, string> = {
  OWNER: "/dashboard/owner/chat",
  PHARMACY_ADMIN: "/dashboard/owner/chat",
  ORG_ADMIN: "/dashboard/organization/chat",
  ORG_OWNER: "/dashboard/organization/chat",
  ORG_STAFF: "/dashboard/organization/chat",
  ORGANIZATION: "/dashboard/organization/chat",
  PHARMACIST: "/dashboard/pharmacist/chat",
  OTHER_STAFF: "/dashboard/otherstaff/chat",
  EXPLORER: "/dashboard/explorer/chat",
};

const PROFILE_ROUTES: Record<string, string> = {
  OWNER: "/dashboard/owner/onboarding",
  PHARMACY_ADMIN: "/dashboard/owner/onboarding",
  ORG_ADMIN: "/dashboard/organization/overview",
  ORG_OWNER: "/dashboard/organization/overview",
  ORG_STAFF: "/dashboard/organization/overview",
  ORGANIZATION: "/dashboard/organization/overview",
  PHARMACIST: "/dashboard/pharmacist/onboarding",
  OTHER_STAFF: "/dashboard/otherstaff/onboarding",
  EXPLORER: "/dashboard/explorer/onboarding",
};

const DASHBOARD_ROUTES: Record<string, string> = {
  OWNER: "/dashboard/owner/overview",
  PHARMACY_ADMIN: "/dashboard/owner/overview",
  ORG_ADMIN: "/dashboard/organization/overview",
  ORG_OWNER: "/dashboard/organization/overview",
  ORG_STAFF: "/dashboard/organization/overview",
  ORGANIZATION: "/dashboard/organization/overview",
  PHARMACIST: "/dashboard/pharmacist/overview",
  OTHER_STAFF: "/dashboard/otherstaff/overview",
  EXPLORER: "/dashboard/explorer/overview",
};

function onboardingRoleForUserRole(role?: string | null) {
  const normalized = String(role || "").toUpperCase();
  if (normalized === "OWNER" || normalized === "PHARMACY_ADMIN") return "owner";
  if (normalized === "PHARMACIST") return "pharmacist";
  if (normalized === "OTHER_STAFF") return "other_staff";
  if (normalized === "EXPLORER") return "explorer";
  return null;
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function profilePhotoFromSource(source: any) {
  return pickFirstString(
    source?.profile_photo_url,
    source?.profilePhotoUrl,
    source?.profile_photo,
    source?.profilePhoto,
    source?.avatar_url,
    source?.avatarUrl
  );
}

type MessageSummary = {
  conversation_id: number;
  conversation_title: string;
  sender_name: string;
  body_preview: string;
  unread: number;
};

const isChatNotificationPayload = (payload: any): boolean => {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  return Boolean(
    payload.conversation_id ??
    payload.conversationId ??
    payload.roomId ??
    payload.room_id ??
    payload.chat_room_id
  );
};

const isMessageNotification = (notification: NotificationItem): boolean => {
  const type = String(notification?.type || "").toLowerCase();
  if (type === "message") {
    return true;
  }
  return isChatNotificationPayload(notification?.payload);
};

const normalizeNotification = (raw: any): NotificationItem => ({
  id: raw.id,
  type: raw.type,
  title: raw.title,
  body: raw.body,
  actionUrl: raw.actionUrl ?? raw.action_url ?? "",
  payload: raw.payload ?? {},
  createdAt: raw.createdAt ?? raw.created_at ?? "",
  readAt: raw.readAt ?? raw.read_at ?? null,
});

export default function TopBarActions({
  hideSearch = false,
  hideThemeToggle = false,
  iconSx,
}: {
  hideSearch?: boolean;
  hideThemeToggle?: boolean;
  iconSx?: SxProps<Theme>;
} = {}) {
  const theme = useTheme();
  const { mode, toggleColorMode } = useColorMode();
  const {
    user,
    logout,
    refreshUnreadCount,
    adminAssignments,
    activePersona,
    activeAdminAssignment,
    selectRolePersona,
    selectAdminPersona,
    isAdminUser,
  } = useAuth();
  const navigate = useNavigate();
  const downSm = useMediaQuery(theme.breakpoints.down("sm"));
  const [query, setQuery] = React.useState("");
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = React.useState(false);
  const [notificationAnchor, setNotificationAnchor] = React.useState<HTMLElement | null>(null);
  const [unreadNotifications, setUnreadNotifications] = React.useState(0);
  const [messageAnchor, setMessageAnchor] = React.useState<HTMLElement | null>(null);
  const [messageSummaries, setMessageSummaries] = React.useState<Record<number, MessageSummary>>({});
  const [unreadMessages, setUnreadMessages] = React.useState(0);
  const [profileAnchor, setProfileAnchor] = React.useState<HTMLElement | null>(null);
  const [onboardingProfile, setOnboardingProfile] = React.useState<any>(null);
  const [pharmacyCount, setPharmacyCount] = React.useState<number | null>(null);
  const wsRef = React.useRef<WebSocket | null>(null);
  const otherStaffRoleType =
    onboardingProfile?.role_type ??
    onboardingProfile?.roleType ??
    (user as any)?.other_staff_profile?.role_type ??
    (user as any)?.otherStaffProfile?.roleType ??
    null;
  const currentRoleLabel = userRoleLabel(user?.role, otherStaffRoleType);

  const filterOptions = React.useMemo(
    () =>
      createFilterOptions<SearchOption>({
        ignoreAccents: true,
        matchFrom: "any",
        stringify: (option) =>
          [option.label, option.description, ...(option.keywords || [])].filter(Boolean).join(" "),
      }),
    []
  );

  const personaOptions = React.useMemo<PersonaMenuOption[]>(() => {
    if (user?.role === "OWNER") {
      return [];
    }
    const options: PersonaMenuOption[] = [];
    if (user?.role === "PHARMACIST" || user?.role === "OTHER_STAFF") {
      options.push({
        key: `ROLE:${user.role}`,
        kind: "ROLE",
        role: user.role,
        label: user.role === "OTHER_STAFF" ? otherStaffRoleLabel(otherStaffRoleType) : "Pharmacist",
        helper: "Staff dashboard",
      });
    }

    adminAssignments.forEach((assignment) => {
      if (!assignment || assignment.id == null) {
        return;
      }
      // Skip pure owner-only records; the switcher is only for explicit admin personas.
      if (assignment.admin_level === "OWNER") {
        return;
      }
      const rawName = typeof assignment.pharmacy_name === "string" ? assignment.pharmacy_name.trim() : "";
      const pharmacyName = rawName || `Pharmacy #${assignment.pharmacy_id}`;
      const jobTitle = assignment.job_title?.trim();
      const levelLabel =
        (assignment.admin_level && ADMIN_LEVEL_LABELS[assignment.admin_level]) ||
        "Admin";
      const helperParts: string[] = [pharmacyName];
      if (jobTitle) {
        helperParts.push(jobTitle);
      } else {
        const staffRole = assignment.staff_role?.trim().toUpperCase();
        if (staffRole) {
          helperParts.push(ADMIN_STAFF_ROLE_LABELS[staffRole] ?? staffRole.replace(/_/g, " "));
        }
      }
      const helperText = helperParts.filter(Boolean).join(" - ") || undefined;

      options.push({
        key: `ADMIN:${assignment.id}`,
        kind: "ADMIN",
        assignmentId: assignment.id,
        label: levelLabel,
        helper: helperText,
      });
    });

    return options;
  }, [adminAssignments, otherStaffRoleType, user?.role]);

  const activePersonaKey = React.useMemo(() => {
    if (activePersona === "admin") {
      const activeId =
        activeAdminAssignment?.id ??
        adminAssignments.find((assignment) => assignment.id != null)?.id ??
        null;
      return activeId != null ? `ADMIN:${activeId}` : null;
    }
    if (
      activePersona === "staff" &&
      (user?.role === "PHARMACIST" || user?.role === "OTHER_STAFF")
    ) {
      return `ROLE:${user.role}`;
    }
    return null;
  }, [activePersona, activeAdminAssignment?.id, adminAssignments, user?.role]);

  const showPersonaSwitcher =
    personaOptions.length > 0 && (isAdminUser || personaOptions.length > 1);

  const profileRoleKey = React.useMemo(() => String(user?.role || "DEFAULT").toUpperCase(), [user?.role]);
  const dashboardRoute = DASHBOARD_ROUTES[profileRoleKey] ?? "/dashboard";
  const profileRoute = PROFILE_ROUTES[profileRoleKey] ?? dashboardRoute;
  const displayFirstName = dashboardGreetingName(user);
  const avatarSrc = profilePhotoFromSource(onboardingProfile) || profilePhotoFromSource(user);
  const avatarInitials =
    displayFirstName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "CT";

  const loadNotifications = React.useCallback(async (options?: { showLoading?: boolean }) => {
    if (!user) {
      setNotifications([]);
      setUnreadNotifications(0);
      setNotificationsLoading(false);
      return;
    }
    if (options?.showLoading !== false) {
      setNotificationsLoading(true);
    }
    try {
      const response = await fetchNotifications();
      const rawList: NotificationItem[] = Array.isArray(response?.results)
        ? response.results
        : [];
      const list = rawList.filter((item) => !isMessageNotification(item));
      setNotifications(list);
      setUnreadNotifications(list.filter((item) => !item.readAt).length);
    } catch (error) {
      console.error("Failed to load notifications", error);
      setNotifications([]);
      setUnreadNotifications(0);
    } finally {
      if (options?.showLoading !== false) {
        setNotificationsLoading(false);
      }
    }
  }, [user]);

  React.useEffect(() => {
    const role = onboardingRoleForUserRole(user?.role);
    if (!user || !role) {
      setOnboardingProfile(null);
      return;
    }

    let cancelled = false;
    getOnboarding(role)
      .then((profile: any) => {
        if (!cancelled) {
          setOnboardingProfile(profile?.data ?? profile ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOnboardingProfile(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role]);

  React.useEffect(() => {
    const handleProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || typeof detail !== "object") {
        return;
      }
      setOnboardingProfile((prev: any) => ({ ...(prev ?? {}), ...detail }));
    };
    window.addEventListener("ct-profile-updated", handleProfileUpdated);
    return () => {
      window.removeEventListener("ct-profile-updated", handleProfileUpdated);
    };
  }, []);

  React.useEffect(() => {
    const roleKey = (user?.role || "").toUpperCase();
    if (roleKey === "OWNER" || roleKey === "PHARMACY_ADMIN" || roleKey.startsWith("ORG")) {
      apiClient
        .get("/client-profile/pharmacies/")
        .then((response) => {
          let count = 0;
          if (typeof response.data.count === "number") {
            count = response.data.count;
          } else if (Array.isArray(response.data.results)) {
            count = response.data.results.length;
          } else if (Array.isArray(response.data)) {
            count = response.data.length;
          }
          setPharmacyCount(count);
        })
        .catch(() => {
          setPharmacyCount(0);
        });
    } else {
      setPharmacyCount(null);
    }
  }, [user?.id, user?.role]);

  const handleCloseProfileMenu = React.useCallback(() => {
    setProfileAnchor(null);
  }, []);

  const handlePersonaSelect = React.useCallback(
    (option: PersonaMenuOption) => {
      if (option.key === activePersonaKey) {
        setProfileAnchor(null);
        return;
      }
      if (option.kind === "ROLE") {
        selectRolePersona(option.role);
        const targetPath = option.role === 'PHARMACIST'
          ? '/dashboard/pharmacist/overview'
          : option.role === 'OTHER_STAFF'
            ? '/dashboard/otherstaff/overview'
            : '/dashboard/explorer/overview';
        navigate(targetPath);
      } else {
        selectAdminPersona(option.assignmentId);
        const assignment = adminAssignments.find((item) => item.id === option.assignmentId);
        if (assignment?.pharmacy_id != null) {
          navigate(`/dashboard/admin/${assignment.pharmacy_id}/overview`, { replace: true });
        }
      }
      setProfileAnchor(null);
    },
    [activePersonaKey, adminAssignments, navigate, selectAdminPersona, selectRolePersona]
  );

  const handleLogout = React.useCallback(() => {
    handleCloseProfileMenu();
    logout();
    navigate("/login", { replace: true });
  }, [handleCloseProfileMenu, logout, navigate]);

  const options = React.useMemo(() => {
    const roleKey = (user?.role || "DEFAULT").toUpperCase();
    let baseOptions = ROLE_SEARCH_OPTIONS[roleKey] ?? ROLE_SEARCH_OPTIONS.DEFAULT;

    if (pharmacyCount !== null && pharmacyCount <= 1) {
      if (roleKey === "OWNER" || roleKey === "PHARMACY_ADMIN") {
        baseOptions = ownerOptions.map((opt) => {
          if (opt.path === "/dashboard/owner/manage-pharmacies") {
            return { ...opt, label: "Manage Pharmacy" };
          }
          if (opt.path === "/dashboard/owner/manage-pharmacies/my-chain") {
            return { ...opt, label: "My Pharmacy" };
          }
          return opt;
        });
      } else if (roleKey.startsWith("ORG")) {
        baseOptions = organizationOptions.map((opt) => {
          if (opt.path === "/dashboard/organization/manage-pharmacies") {
            return { ...opt, label: "Manage Pharmacy" };
          }
          if (opt.path === "/dashboard/organization/manage-pharmacies/my-pharmacies") {
            return { ...opt, label: "My Pharmacy" };
          }
          return opt;
        });
      }
    }

    if (
      activePersona === "admin" &&
      activeAdminAssignment?.pharmacy_id
    ) {
      const adminBase = `/dashboard/admin/${activeAdminAssignment.pharmacy_id}`;
      const remapPath = (path: string) => {
        if (path.startsWith("/dashboard/owner")) {
          return path.replace("/dashboard/owner", adminBase);
        }
        if (path.startsWith("/dashboard/admin/")) {
          return path;
        }
        if (path.startsWith("/")) {
          return `${adminBase}${path}`;
        }
        return `${adminBase}/${path}`;
      };
      baseOptions = baseOptions.map((option) => ({
        ...option,
        path: remapPath(option.path),
      }));
    }

    return baseOptions;
  }, [user?.role, activePersona, activeAdminAssignment?.pharmacy_id, pharmacyCount]);

  const searchFieldSx = React.useMemo(
    () => ({
      width: { xs: "100%", sm: 280 },
      "& .MuiOutlinedInput-root": {
        borderRadius: theme.shape.borderRadius,
        backgroundColor: alpha(theme.palette.common.white, 0.04),
        transition: theme.transitions.create(["background-color", "box-shadow", "border-color"]),
        "&:hover": {
          backgroundColor: alpha(theme.palette.common.white, 0.08),
        },
        "&.Mui-focused": {
          backgroundColor: alpha(theme.palette.common.white, 0.1),
          boxShadow: theme.shadows[2],
        },
        "& fieldset": {
          borderColor: alpha(theme.palette.divider, 0.6),
        },
        "&:hover fieldset": {
          borderColor: alpha(theme.palette.primary.main, 0.4),
        },
        "&.Mui-focused fieldset": {
          borderColor: theme.palette.primary.main,
        },
      },
    }),
    [theme]
  );

  const closeMobile = React.useCallback(() => {
    setMobileOpen(false);
    setQuery("");
  }, []);

  const handleNavigate = React.useCallback(
    (option: SearchOption | null) => {
      if (!option) return;
      navigate(option.path);
      setQuery("");
      if (downSm) {
        closeMobile();
      }
    },
    [navigate, downSm, closeMobile]
  );

  const handleEnterSubmit = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Enter" || !query.trim()) return;
      const matches = filterOptions(options, {
        inputValue: query,
        getOptionLabel: (option) => option.label,
      });
      const firstMatch = matches[0];
      if (firstMatch) {
        event.preventDefault();
        handleNavigate(firstMatch);
      }
    },
    [filterOptions, options, query, handleNavigate]
  );

  const chatRoute = React.useMemo(() => {
    const roleKey = (user?.role || "OWNER").toUpperCase();
    return CHAT_ROUTES[roleKey] ?? "/dashboard/owner/chat";
  }, [user?.role]);

  const unreadMessageEntries = React.useMemo(
    () => Object.values(messageSummaries).filter((entry) => entry.unread > 0),
    [messageSummaries]
  );

  const anyUnreadNotifications = React.useMemo(
    () => notifications.some((item) => !item.readAt),
    [notifications]
  );

  React.useEffect(() => {
    const total = Object.values(messageSummaries).reduce(
      (sum, item) => sum + (item.unread || 0),
      0
    );
    setUnreadMessages(total);
  }, [messageSummaries]);

  React.useEffect(() => {
    loadNotifications().then(() => null);
  }, [loadNotifications]);

  React.useEffect(() => {
    if (!user) {
      setMessageSummaries({});
      return;
    }
    let cancelled = false;

    fetchRooms()
      .then((rawRooms) => {
        if (cancelled) return;
        const next: Record<number, MessageSummary> = {};
        rawRooms.forEach((room: any) => {
          if (!room || typeof room.id !== "number") {
            return;
          }
          const unread = room.unread_count || 0;
          if (!unread) {
            return;
          }
          const lastMessage = (
            room.last_message ||
            room.latest_message ||
            room.most_recent_message ||
            room.recent_message ||
            {}
          ) as Record<string, any>;
          const senderName =
            lastMessage?.sender_name ||
            lastMessage?.sender?.name ||
            lastMessage?.sender?.user?.full_name ||
            lastMessage?.sender?.user?.email ||
            lastMessage?.sender?.user_details?.full_name ||
            lastMessage?.sender?.user_details?.email ||
            "";
          const body =
            (lastMessage?.body || lastMessage?.text || lastMessage?.preview || "").toString();
          next[room.id] = {
            conversation_id: room.id,
            conversation_title:
              room.title || room.name || room.display_name || room.conversation_title || "",
            sender_name: senderName,
            body_preview: body,
            unread,
          };
        });
        setMessageSummaries(next);
        refreshUnreadCount();
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("WebSocket error:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [user, refreshUnreadCount]);

  React.useEffect(() => {
    if (!user) return;
    const intervalId = window.setInterval(() => {
      loadNotifications({ showLoading: false }).then(() => null);
    }, 45000);
    return () => window.clearInterval(intervalId);
  }, [user, loadNotifications]);

  React.useEffect(() => {
    if (!user) return;

    let isCancelled = false;

    const connectWs = async () => {
      const ticket = await fetchWsTicket();
      if (isCancelled || !ticket) return;

      let wsUrl = "";
      try {
        const apiBase = (API_BASE_URL as string | undefined) ?? window.location.origin;
        const resolved = new URL(apiBase, window.location.origin);
        const wsProtocol = resolved.protocol === "https:" ? "wss:" : "ws:";
        const url = new URL(`${wsProtocol}//${resolved.host}/ws/notifications/`);
        url.searchParams.set("ticket", ticket);
        wsUrl = url.toString();
      } catch {
        const { protocol, host } = window.location;
        const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
        const url = new URL(`${wsProtocol}//${host}/ws/notifications/`);
        url.searchParams.set("ticket", ticket);
        wsUrl = url.toString();
      }

      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          switch (payload.type) {
            case "notification.counter":
              // Backend counter includes message notifications.
              // Web bell excludes chat notifications, so refresh the filtered list/count.
              loadNotifications({ showLoading: false }).then(() => null);
              break;
            case "notification.created":
              if (payload.notification) {
                const incoming = normalizeNotification(payload.notification);
                if (isMessageNotification(incoming)) {
                  break;
                }
                try {
                  window.dispatchEvent(
                    new CustomEvent("shift-slot-activity", {
                      detail: incoming,
                    })
                  );
                  window.dispatchEvent(
                    new CustomEvent("chemisttasker-notification-created", {
                      detail: incoming,
                    })
                  );
                } catch {
                  // ignore custom event failures
                }
                setNotifications((prev) => {
                  const next = [
                    incoming,
                    ...prev.filter((item) => item.id !== incoming.id),
                  ].slice(0, 25);
                  setUnreadNotifications(next.filter((item) => !item.readAt).length);
                  return next;
                });
              }
              break;
            case "notification.updated":
              if (payload.notification) {
                const incoming = normalizeNotification(payload.notification);
                if (isMessageNotification(incoming)) {
                  setNotifications((prev) => {
                    const next = prev.filter((item) => item.id !== incoming.id);
                    setUnreadNotifications(next.filter((item) => !item.readAt).length);
                    return next;
                  });
                  break;
                }
                setNotifications((prev) => {
                  const next = prev.map((item) =>
                    item.id === incoming.id
                      ? incoming
                      : item
                  );
                  setUnreadNotifications(next.filter((item) => !item.readAt).length);
                  return next;
                });
              }
              break;
            case "message.badge":
              if (payload.conversation_id) {
                setMessageSummaries((prev) => {
                  const next = { ...prev };
                  const existing = next[payload.conversation_id] || {
                    conversation_id: payload.conversation_id,
                    conversation_title: "",
                    sender_name: "",
                    body_preview: "",
                    unread: 0,
                  };
                  next[payload.conversation_id] = {
                    ...existing,
                    conversation_title:
                      payload.conversation_title ?? existing.conversation_title,
                    sender_name: payload.sender_name ?? existing.sender_name,
                    body_preview: payload.body_preview ?? existing.body_preview,
                    unread: typeof payload.unread === "number" ? payload.unread : existing.unread,
                  };
                  return next;
                });
                refreshUnreadCount();
              }
              break;
            case "message.read":
              if (payload.conversation_id) {
                setMessageSummaries((prev) => {
                  const next = { ...prev };
                  if (next[payload.conversation_id]) {
                    next[payload.conversation_id] = {
                      ...next[payload.conversation_id],
                      unread: 0,
                    };
                  }
                  return next;
                });
                refreshUnreadCount();
              }
              break;
            default:
              break;
          }
        } catch (error) {
          console.error("Failed to process websocket message", error);
        }
      };

      socket.onerror = (error) => {
        // Avoid noisy logs when the ticket is stale/invalid.
        console.warn("Notifications websocket error", error);
      };

      socket.onclose = () => {
        if (wsRef.current === socket) {
          wsRef.current = null;
        }
      };
    };

    connectWs();

    return () => {
      isCancelled = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user, refreshUnreadCount, loadNotifications]);

  const markAllNotifications = React.useCallback(async () => {
    const unreadIds = notifications.filter((item) => !item.readAt).map((item) => item.id);
    if (!unreadIds.length) {
      return;
    }
    try {
      const res = await markNotificationsRead(unreadIds);
      const nowIso = new Date().toISOString();
      setUnreadNotifications(res.unread ?? 0);
      setNotifications((prev) =>
        prev.map((item) => (item.readAt ? item : { ...item, readAt: nowIso }))
      );
    } catch (error) {
      console.error("Failed to mark notifications read", error);
    }
  }, [notifications]);

  const handleOpenNotifications = (event: React.MouseEvent<HTMLElement>) => {
    setNotificationAnchor(event.currentTarget);
    if (anyUnreadNotifications) {
      void markAllNotifications();
    }
  };

  const handleCloseNotifications = React.useCallback(() => {
    setNotificationAnchor(null);
  }, []);

  const handleOpenMessages = (event: React.MouseEvent<HTMLElement>) => {
    setMessageAnchor(event.currentTarget);
  };

  const handleCloseMessages = React.useCallback(() => {
    setMessageAnchor(null);
  }, []);

  const handleNotificationNavigate = React.useCallback(
    (item: NotificationItem) => {
      const payload: any = item.payload ?? {};
      const shiftId = payload.shift_id ?? payload.shiftId ?? null;
      const slotId =
        payload.slot_id ??
        payload.slotId ??
        (Array.isArray(payload.slot_ids) ? payload.slot_ids[0] : null) ??
        (Array.isArray(payload.slotIds) ? payload.slotIds[0] : null) ??
        null;
      const offerId = payload.offer_id ?? payload.offerId ?? null;
      const conversationId =
        payload.conversation_id ??
        payload.conversationId ??
        payload.roomId ??
        payload.room_id ??
        payload.chat_room_id ??
        null;
      const navigateToActionUrl = (actionUrl: string) => {
        try {
          const target = new URL(actionUrl, window.location.origin);
          target.searchParams.set("notification_id", String(item.id));
          target.searchParams.set("_ntf", String(Date.now()));
          if (shiftId != null) target.searchParams.set("shift_id", String(shiftId));
          if (slotId != null) target.searchParams.set("slot_id", String(slotId));
          if (offerId != null) target.searchParams.set("offer_id", String(offerId));
          if (target.origin === window.location.origin) {
            const ownerPharmacyId = payload.pharmacy_id ?? payload.pharmacyId ?? null;
            const adminMembershipPathMatch = target.pathname.match(/^\/dashboard\/admin\/(\d+)\/manage-pharmacies\/my-pharmacies\/?$/);
            if (String(user?.role || "").toUpperCase() === "OWNER" && adminMembershipPathMatch) {
              const pharmacyId = ownerPharmacyId ?? adminMembershipPathMatch[1];
              target.pathname = "/dashboard/owner/manage-pharmacies/my-pharmacies";
              target.searchParams.set("view", "detail");
              target.searchParams.set("pharmacyId", String(pharmacyId));
              navigate(`${target.pathname}${target.search}${target.hash}`);
              return;
            }
            navigate(`${target.pathname}${target.search}${target.hash}`);
          } else {
            window.location.href = target.toString();
          }
        } catch {
          const normalized = actionUrl.startsWith('/')
            ? actionUrl
            : `/${actionUrl}`;
          const [pathAndSearch, hash = ""] = normalized.split("#");
          const [path, search = ""] = pathAndSearch.split("?");
          const params = new URLSearchParams(search);
          params.set("notification_id", String(item.id));
          params.set("_ntf", String(Date.now()));
          if (shiftId != null) params.set("shift_id", String(shiftId));
          if (slotId != null) params.set("slot_id", String(slotId));
          if (offerId != null) params.set("offer_id", String(offerId));
          navigate(`${path}?${params.toString()}${hash ? `#${hash}` : ""}`);
        }
      };
      if (conversationId) {
        navigate(`${chatRoute}?conversationId=${conversationId}`);
      } else if (offerId || shiftId) {
        const role = String(user?.role || "").toUpperCase();
        const isWorkerRole = role === "PHARMACIST" || role === "OTHER_STAFF" || role === "EXPLORER";
        if (isWorkerRole) {
          const rolePath =
            role === "PHARMACIST"
              ? "pharmacist"
              : role === "OTHER_STAFF"
                ? "otherstaff"
                : "explorer";
          if (offerId != null) {
            const params = new URLSearchParams();
            params.set("tab", "accepted");
            if (shiftId != null) params.set("shift_id", String(shiftId));
            if (slotId != null) params.set("slot_id", String(slotId));
            params.set("offer_id", String(offerId));
            params.set("notification_id", String(item.id));
            params.set("_ntf", String(Date.now()));
            navigate(`/dashboard/${rolePath}/shifts?${params.toString()}`);
          } else if (shiftId != null) {
            const params = new URLSearchParams();
            if (slotId != null) params.set("slot_id", String(slotId));
            params.set("notification_id", String(item.id));
            params.set("_ntf", String(Date.now()));
            navigate(`/dashboard/${rolePath}/shifts/${shiftId}?${params.toString()}`);
          } else if (item.actionUrl) {
            navigateToActionUrl(item.actionUrl);
          }
        } else if (shiftId != null) {
          const params = new URLSearchParams();
          if (slotId != null) params.set("slot_id", String(slotId));
          if (offerId != null) params.set("offer_id", String(offerId));
          params.set("notification_id", String(item.id));
          params.set("_ntf", String(Date.now()));
          if (activePersona === "admin" && activeAdminAssignment?.pharmacy_id) {
            navigate(`/dashboard/admin/${activeAdminAssignment.pharmacy_id}/shifts/${shiftId}?${params.toString()}`);
          } else if (role === "OWNER") {
            navigate(`/dashboard/owner/shifts/${shiftId}?${params.toString()}`);
          } else {
            navigate(`/dashboard/organization/shifts/${shiftId}?${params.toString()}`);
          }
        } else if (item.actionUrl) {
          navigateToActionUrl(item.actionUrl);
        } else {
          handleCloseNotifications();
          return;
        }
      } else if (item.actionUrl) {
        navigateToActionUrl(item.actionUrl);
      } else {
        handleCloseNotifications();
        return;
      }
      const nowIso = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((existing) =>
          existing.id === item.id ? { ...existing, readAt: existing.readAt ?? nowIso } : existing
        )
      );
      if (!item.readAt) {
        setUnreadNotifications((prev) => Math.max(0, prev - 1));
      }
      void markNotificationsRead([item.id]).catch((error) =>
        console.error('Failed to mark notification read', error)
      );
      handleCloseNotifications();
    },
    [chatRoute, handleCloseNotifications, navigate, user?.role]
  );
  const handleMessageNavigate = React.useCallback(
    (summary: MessageSummary) => {
      handleCloseMessages();
      setMessageSummaries((prev) => {
        const next = { ...prev };
        if (next[summary.conversation_id]) {
          next[summary.conversation_id] = { ...next[summary.conversation_id], unread: 0 };
        }
        return next;
      });
      refreshUnreadCount();
      navigate(chatRoute, { state: { conversationId: summary.conversation_id } });
    },
    [chatRoute, handleCloseMessages, navigate, refreshUnreadCount]
  );

  const renderSearchField = React.useCallback(
    (autoFocus = false) => (
      <Autocomplete
        sx={searchFieldSx}
        options={options}
        filterOptions={filterOptions}
        autoComplete
        autoHighlight
        includeInputInList
        clearOnBlur={false}
        openOnFocus
        value={null}
        onChange={(_, value) => handleNavigate(value)}
        inputValue={query}
        onInputChange={(_, value) => setQuery(value)}
        getOptionLabel={(option) => option.label}
        isOptionEqualToValue={(option, value) => option.path === value.path}
        noOptionsText={query ? "No matches found" : "Start typing to search pages"}
        renderOption={(props, option) => (
          <Box component="li" {...props} sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
            <Typography variant="body2" fontWeight={600}>
              {option.label}
            </Typography>
            {option.description && (
              <Typography variant="caption" color="text.secondary">
                {option.description}
              </Typography>
            )}
          </Box>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            autoFocus={autoFocus}
            placeholder="Search pages..."
            size="small"
            onKeyDown={handleEnterSubmit}
            InputProps={{
              ...params.InputProps,
              startAdornment: (
                <InputAdornment position="start" sx={{ color: "text.secondary" }}>
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        )}
      />
    ),
    [filterOptions, handleEnterSubmit, handleNavigate, options, query, searchFieldSx]
  );

  return (
    <Stack
      direction="row"
      spacing={{ xs: 0.25, sm: 1.25 }}
      alignItems="center"
      useFlexGap
      flexWrap="nowrap"
      sx={{
        justifyContent: "flex-end",
        minWidth: 0,
        width: "100%",
      }}
    >
      {!hideSearch && (downSm ? (
        <>
          <Tooltip title="Search">
            <IconButton color="inherit" size="small" aria-label="open search" onClick={() => setMobileOpen(true)}>
              <SearchIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Dialog open={mobileOpen} onClose={closeMobile} fullWidth maxWidth="sm">
            <DialogTitle
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                pr: 1,
              }}
            >
              <Typography variant="subtitle1" fontWeight={600}>
                Search pages
              </Typography>
              <IconButton size="small" onClick={closeMobile} aria-label="close search dialog">
                <CloseIcon fontSize="small" />
              </IconButton>
            </DialogTitle>
            <DialogContent sx={{ pt: 0, pb: 2 }}>{renderSearchField(true)}</DialogContent>
          </Dialog>
        </>
      ) : (
        renderSearchField()
      ))}

      <Tooltip title="Notifications">
        <IconButton
          color="inherit"
          size="small"
          aria-label="notifications"
          onClick={handleOpenNotifications}
          sx={iconSx}
        >
          <Badge
            color="error"
            overlap="circular"
            badgeContent={unreadNotifications}
          >
            <NotificationsNoneOutlinedIcon fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>

      <Tooltip title="Messages">
        <IconButton
          color="inherit"
          size="small"
          aria-label="messages"
          onClick={handleOpenMessages}
          sx={iconSx}
        >
          <Badge color="error" overlap="circular" badgeContent={unreadMessages}>
            <ChatBubbleOutlineOutlinedIcon fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={Boolean(notificationAnchor)}
        anchorEl={notificationAnchor}
        onClose={handleCloseNotifications}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{ sx: { width: { xs: "calc(100vw - 24px)", sm: 360 }, maxWidth: 360, maxHeight: 420, p: 0.5 } }}
      >
        {notificationsLoading ? (
          <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CircularProgress size={20} />
          </Box>
        ) : notifications.length === 0 ? (
          <Box sx={{ p: 2, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              No notifications
            </Typography>
          </Box>
        ) : (
          <List dense disablePadding>
            {notifications.map((item, index) => (
              <React.Fragment key={item.id}>
                <ListItem disablePadding alignItems="flex-start">
                  <ListItemButton
                    onClick={() => handleNotificationNavigate(item)}
                    sx={{
                      alignItems: "flex-start",
                      bgcolor: item.readAt ? "transparent" : alpha(theme.palette.primary.main, 0.08),
                    }}
                  >
                    <ListItemText
                      primary={item.title}
                      secondary={item.body || dayjs.utc(item.createdAt).local().toDate().toLocaleString()}
                      primaryTypographyProps={{ fontWeight: item.readAt ? 500 : 700 }}
                      secondaryTypographyProps={{ color: "text.secondary" }}
                    />
                  </ListItemButton>
                </ListItem>
                {index < notifications.length - 1 && <Divider component="li" />}
              </React.Fragment>
            ))}
            {anyUnreadNotifications && (
              <>
                <Divider component="li" />
                <ListItem disablePadding>
                  <ListItemButton onClick={() => void markAllNotifications()}>
                    <ListItemText
                      primary="Mark all as read"
                      primaryTypographyProps={{ align: "center", fontWeight: 600 }}
                    />
                  </ListItemButton>
                </ListItem>
              </>
            )}
          </List>
        )}
      </Popover>

      <Popover
        open={Boolean(messageAnchor)}
        anchorEl={messageAnchor}
        onClose={handleCloseMessages}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{ sx: { width: { xs: "calc(100vw - 24px)", sm: 360 }, maxWidth: 360, maxHeight: 420, p: 0.5 } }}
      >
        {unreadMessageEntries.length === 0 ? (
          <Box sx={{ p: 2, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              No new messages
            </Typography>
          </Box>
        ) : (
          <List dense disablePadding>
            {unreadMessageEntries.map((msg, index) => {
              const title = msg.sender_name
                ? `${msg.sender_name} messaged you`
                : msg.conversation_title
                  ? `New messages in ${msg.conversation_title}`
                  : "New messages";
              const preview = msg.body_preview || "Open chat to read";
              return (
                <React.Fragment key={msg.conversation_id}>
                  <ListItem disablePadding alignItems="flex-start">
                    <ListItemButton onClick={() => handleMessageNavigate(msg)}>
                      <ListItemText
                        primary={title}
                        secondary={preview}
                        primaryTypographyProps={{ fontWeight: 600 }}
                      />
                      <Badge color="error" badgeContent={msg.unread} />
                    </ListItemButton>
                  </ListItem>
                  {index < unreadMessageEntries.length - 1 && <Divider component="li" />}
                </React.Fragment>
              );
            })}
          </List>
        )}
      </Popover>

      {!hideThemeToggle && (
        <Tooltip title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
          <IconButton color="inherit" size="small" onClick={toggleColorMode} aria-label="toggle theme" sx={iconSx}>
            {mode === "dark" ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      )}

      <Paper
        component="button"
        type="button"
        elevation={0}
        onClick={(event: React.MouseEvent<HTMLButtonElement>) => setProfileAnchor(event.currentTarget)}
        sx={{
          display: { xs: "none", md: "flex" },
          alignItems: "center",
          gap: 1.5,
          height: { xs: 48, md: 58 },
          px: 1.25,
          borderRadius: { xs: "14px", md: "18px" },
          border: "1px solid var(--ct-border-color)",
          bgcolor: "var(--ct-surface-bg)",
          color: "var(--ct-text-primary)",
          cursor: "pointer",
          font: "inherit",
          textAlign: "left",
          minWidth: 0,
          width: { md: 210, lg: 230, xl: 240 },
          flexShrink: 0,
          "&:hover": {
            bgcolor: "var(--ct-hover-bg)",
            borderColor: "var(--ct-dashboard-accent)",
          },
        }}
      >
        <Avatar
          src={avatarSrc || undefined}
          sx={{
            width: { xs: 34, md: 40 },
            height: { xs: 34, md: 40 },
            fontSize: { xs: 12, md: 14 },
            fontWeight: 900,
            background: "linear-gradient(135deg, #6D28D9, #063BDA)",
          }}
        >
          {avatarInitials}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ maxWidth: 142, fontSize: 14, fontWeight: 900, color: "var(--ct-text-primary)" }}>
            {displayFirstName}
          </Typography>
          <Typography sx={{ fontSize: 12, fontWeight: 800, color: "var(--ct-text-secondary)", textTransform: "uppercase" }}>
            {activePersona === "admin"
              ? activeAdminAssignment?.admin_level ?? "Admin"
              : currentRoleLabel}
          </Typography>
        </Box>
        <KeyboardArrowDownIcon
          sx={{
            ml: "auto",
            fontSize: 18,
            color: "var(--ct-text-secondary)",
            transform: profileAnchor ? "rotate(180deg)" : "none",
            transition: "transform .18s",
          }}
        />
      </Paper>

      <Tooltip title="Profile">
        <IconButton
          color="inherit"
          size="small"
          aria-label="profile menu"
          onClick={(event) => setProfileAnchor(event.currentTarget)}
          sx={{ display: { xs: "inline-flex", md: "none" }, ...iconSx }}
        >
          <Avatar
            src={avatarSrc || undefined}
            sx={{ width: 30, height: 30, fontSize: 11, fontWeight: 900, background: "linear-gradient(135deg, #6D28D9, #063BDA)" }}
          >
            {avatarInitials}
          </Avatar>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={profileAnchor}
        open={Boolean(profileAnchor)}
        onClose={handleCloseProfileMenu}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              width: 300,
              maxWidth: "calc(100vw - 24px)",
              borderRadius: 3,
              border: "1px solid var(--ct-border-color)",
              boxShadow: "0 22px 58px rgba(2,18,44,0.18)",
              overflow: "hidden",
            },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.75, display: "flex", alignItems: "center", gap: 1.5 }}>
          <Avatar
            src={avatarSrc || undefined}
            sx={{ width: 46, height: 46, fontWeight: 900, background: "linear-gradient(135deg, #6D28D9, #063BDA)" }}
          >
            {avatarInitials}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 900, color: "var(--ct-text-primary)" }}>
              {displayFirstName}
            </Typography>
            <Typography noWrap sx={{ fontSize: 12, fontWeight: 700, color: "var(--ct-text-secondary)" }}>
              {user?.email || currentRoleLabel}
            </Typography>
          </Box>
        </Box>
        <Divider />
        <MenuItem
          onClick={() => {
            handleCloseProfileMenu();
            navigate(dashboardRoute);
          }}
        >
          <ListItemIcon><DashboardOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Dashboard" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleCloseProfileMenu();
            navigate(profileRoute);
          }}
        >
          <ListItemIcon><PersonOutlineIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Profile & onboarding" />
        </MenuItem>
        {showPersonaSwitcher && [
            <Divider key="persona-divider" />,
            <Box key="persona-label" sx={{ px: 2, pt: 1, pb: 0.5 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "text.secondary" }}>
                Switch role
              </Typography>
            </Box>,
            ...personaOptions.map((option) => (
              <MenuItem key={option.key} selected={option.key === activePersonaKey} onClick={() => handlePersonaSelect(option)}>
                <ListItemIcon>
                  {option.kind === "ADMIN" ? <DashboardOutlinedIcon fontSize="small" /> : <PersonOutlineIcon fontSize="small" />}
                </ListItemIcon>
                <ListItemText primary={option.label} secondary={option.helper} />
              </MenuItem>
            )),
        ]}
        <Divider />
        <MenuItem onClick={handleLogout}>
          <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Logout" />
        </MenuItem>
      </Menu>
    </Stack>
  );
}
