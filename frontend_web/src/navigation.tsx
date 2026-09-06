// src/navigation.tsx
import { Navigation } from "@toolpad/core";
import DashboardIcon from '@mui/icons-material/Dashboard'
import MedicationLiquidIcon from '@mui/icons-material/MedicationLiquid'
import CorporateFareIcon from '@mui/icons-material/CorporateFare'
import PostAddIcon from '@mui/icons-material/PostAdd'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import PersonSearchIcon from '@mui/icons-material/PersonSearch'
import SchoolIcon from '@mui/icons-material/School'
import LogoutIcon from '@mui/icons-material/Logout'
import ManageAccountsSharpIcon from '@mui/icons-material/ManageAccountsSharp'
import StoreIcon from '@mui/icons-material/Store'
import PublicIcon from '@mui/icons-material/Public'
import GroupsIcon from '@mui/icons-material/Groups'
import ForumIcon from '@mui/icons-material/Forum'
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HistoryIcon from '@mui/icons-material/History';
import ReceiptIcon from '@mui/icons-material/Receipt';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
// import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
// import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import VerifiedRoundedIcon from "@mui/icons-material/VerifiedRounded";
import HourglassEmptyRoundedIcon from "@mui/icons-material/HourglassEmptyRounded";
import type { AdminAssignment } from "./contexts/AuthContext";
import {
  ADMIN_CAPABILITY_MANAGE_ADMINS,
  ADMIN_CAPABILITY_MANAGE_COMMUNICATIONS,
  ADMIN_CAPABILITY_MANAGE_ROSTER,
  ADMIN_CAPABILITY_MANAGE_STAFF,
} from "./constants/adminCapabilities";
import { useEffect, useState } from "react";
import { getOnboarding } from "@chemisttasker/shared-core";

// Helper component for the "NEW" badge
const NewMessagesChip = () => (
  <Chip
    size="small"
    label="NEW"
    color="success"
    sx={{ ml: 0.5, fontWeight: 700, height: '18px', fontSize: '10px' }}
  />
);

function ProfileStatusAction({
  onboardingKey,
  progressPercent,
}: {
  onboardingKey: "pharmacist" | "otherstaff" | "explorer";
  progressPercent: number;
}) {
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res: any = await getOnboarding(onboardingKey as any);
        if (!active) {
          return;
        }
        setVerified(!!(res?.verified ?? res?.is_verified ?? res?.isVerified ?? false));
      } catch {
        if (active) {
          setVerified(false);
        }
      }
    };

    void load();

    const handler = () => {
      void load();
    };

    window.addEventListener("onboarding-updated", handler);
    return () => {
      active = false;
      window.removeEventListener("onboarding-updated", handler);
    };
  }, [onboardingKey]);

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, ml: 0.5 }}>
      <Chip
        size="small"
        label={`${progressPercent}%`}
        color={progressPercent === 100 ? "success" : "default"}
        sx={{ fontWeight: 700, height: "18px", fontSize: "10px" }}
      />
      <Tooltip title={verified ? "Verified" : "Pending verification"} arrow>
        <Box
          component="span"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: verified ? "success.main" : "text.secondary",
            lineHeight: 0,
          }}
        >
          {verified ? (
            <VerifiedRoundedIcon sx={{ fontSize: 16 }} />
          ) : (
            <HourglassEmptyRoundedIcon sx={{ fontSize: 15 }} />
          )}
        </Box>
      </Tooltip>
    </Box>
  );
}

export function getOrganizationNav(hasUnreadMessages: boolean): Navigation {
  return [
    { kind: 'header' as const, title: 'Organization Management' },
    { segment: 'dashboard/organization/overview', title: 'Overview', icon: <GroupsIcon /> },
    { segment: 'dashboard/organization/invite', title: 'Invite Staff', icon: <ManageAccountsSharpIcon /> },
    {
      segment: 'dashboard/organization/chat',
      title: 'Chat',
      icon: <GroupsIcon />,
      action: hasUnreadMessages ? <NewMessagesChip /> : null,
    },
    { segment: 'dashboard/pharmacy-hub', title: 'Pharmacy Hub', icon: <ForumIcon /> },
    { segment: 'dashboard/organization/calendar', title: 'Calendar', icon: <CalendarMonthIcon /> },
    { kind: 'divider' as const },
    { kind: 'header' as const, title: 'Manage Pharmacies and Shifts' },
    {
      segment: 'dashboard/organization/manage-pharmacies',
      title: 'Manage Pharmacies',
      icon: <MedicationLiquidIcon />,
      children: [
        { segment: 'my-pharmacies', title: 'My Pharmacies', icon: <StoreIcon /> },
        { segment: 'my-chain', title: 'My Chain', icon: <CorporateFareIcon /> },
        { segment: 'roster', title: 'Internal Roster', icon: <EventAvailableIcon /> },
      ],
    },
    { segment: 'dashboard/organization/post-shift', title: 'Post Shift', icon: <PostAddIcon /> },
    {
      segment: 'dashboard/organization/shift-center',
      title: 'Shift Centre',
      icon: <AccessTimeIcon />,
      children: [
        { segment: 'active', title: 'Active Shifts', icon: <PlayArrowIcon /> },
        { segment: 'confirmed', title: 'Confirmed Shifts', icon: <CheckCircleIcon /> },
        { segment: 'history', title: 'Shifts History', icon: <HistoryIcon /> },
      ],
    },
    { kind: 'divider' as const },
    { kind: 'header' as const, title: 'Learning & Explorer Hub' },
    { segment: 'dashboard/organization/interests', title: 'Talent Hub', icon: <PersonSearchIcon /> },
    { segment: 'dashboard/organization/learning', title: 'Learning Materials', icon: <SchoolIcon /> },
    { kind: 'divider' as const },
    { segment: 'dashboard/organization/logout', title: 'Logout', icon: <LogoutIcon /> },
  ]
}

export function getOwnerNav(progressPercent: number, hasUnreadMessages: boolean): Navigation {
  return [
    { kind: "header" as const, title: "Profile Settings" },
    { segment: "dashboard/owner/overview", title: "Overview", icon: <DashboardIcon /> },
    {
      segment: "dashboard/owner/onboarding",
      title: "Profile",
      icon: <ManageAccountsSharpIcon />,
      action: (
        <Chip
          size="small"
          label={`${progressPercent}%`}
          color={progressPercent === 100 ? "success" : "default"}
          sx={{ ml: 0.5, fontWeight: 700 }}
        />
      ),
    },
    {
      segment: "dashboard/owner/chat",
      title: "Chat",
      icon: <GroupsIcon />,
      action: hasUnreadMessages ? <NewMessagesChip /> : null,
    },
    { segment: "dashboard/pharmacy-hub", title: "Pharmacy Hub", icon: <ForumIcon /> },
    { segment: "dashboard/owner/calendar", title: "Calendar", icon: <CalendarMonthIcon /> },
    { kind: "divider" as const },
    { kind: "header" as const, title: "Manage Pharmacies and Shifts" },
    {
      segment: "dashboard/owner/manage-pharmacies",
      title: "Manage Pharmacies",
      icon: <MedicationLiquidIcon />,
      children: [
        { segment: "my-pharmacies", title: "My Pharmacy", icon: <StoreIcon /> },
        { segment: "my-chain", title: "My Chain", icon: <CorporateFareIcon /> },
        { segment: "roster", title: "Internal Roster", icon: <EventAvailableIcon /> },
      ],
    },
    { segment: "dashboard/owner/post-shift", title: "Post Shift", icon: <PostAddIcon /> },
    {
      segment: "dashboard/owner/shift-center",
      title: "Shift Centre",
      icon: <AccessTimeIcon />,
      children: [
        { segment: "active", title: "Active Shifts", icon: <PlayArrowIcon /> },
        { segment: "confirmed", title: "Confirmed Shifts", icon: <CheckCircleIcon /> },
        { segment: "history", title: "Shifts History", icon: <HistoryIcon /> },
      ],
    },
    { segment: "dashboard/owner/invoice", title: "Invoices", icon: <ReceiptIcon /> },
    { kind: "divider" as const },
    { kind: "header" as const, title: "Learning & Explorer Hub" },
    { segment: "dashboard/owner/interests", title: "Talent Hub", icon: <PersonSearchIcon /> },
    { segment: "dashboard/owner/learning", title: "Learning Materials", icon: <SchoolIcon /> },
    { kind: "divider" as const },
    { segment: "dashboard/owner/logout", title: "Logout", icon: <LogoutIcon /> },
  ];
}

type AdminNavParams = {
  assignments: AdminAssignment[];
  hasUnreadMessages: boolean;
  userRole: string;
  activeAssignment: AdminAssignment | null;
  activePharmacyId?: number | null;
};

export function getAdminNav({
  assignments,
  hasUnreadMessages,
  userRole,
  activeAssignment,
  activePharmacyId,
}: AdminNavParams): Navigation {
  const allAssignments = Array.isArray(assignments) ? assignments : [];
  const hasAnyAssignments = allAssignments.length > 0;
  const capabilitySources =
    activeAssignment && activeAssignment.capabilities?.length
      ? [activeAssignment]
      : allAssignments;
  const capabilitySet = new Set<string>();

  capabilitySources.forEach((assignment) => {
    if (!assignment?.capabilities) return;
    assignment.capabilities.forEach((cap) => capabilitySet.add(cap));
  });

  const scopedPharmacyId =
    typeof activePharmacyId === "number"
      ? activePharmacyId
      : activeAssignment?.pharmacy_id ?? null;

  const adminBase =
    scopedPharmacyId != null ? `dashboard/admin/${scopedPharmacyId}` : "dashboard/admin";

  const buildPath = (suffix: string) => `${adminBase}/${suffix}`.replace(/\/+/g, "/");

  const isOwner = userRole === "OWNER";
  const canManageAdmins =
    capabilitySet.has(ADMIN_CAPABILITY_MANAGE_ADMINS) || isOwner || !hasAnyAssignments;
  const canManageStaff =
    capabilitySet.has(ADMIN_CAPABILITY_MANAGE_STAFF) || isOwner || !hasAnyAssignments;
  const canManageRoster =
    capabilitySet.has(ADMIN_CAPABILITY_MANAGE_ROSTER) || isOwner || !hasAnyAssignments;
  const canManageComms =
    capabilitySet.has(ADMIN_CAPABILITY_MANAGE_COMMUNICATIONS) ||
    canManageStaff ||
    canManageRoster ||
    isOwner ||
    !hasAnyAssignments;

  const navigation: Navigation = [
    { kind: "header" as const, title: "Profile Settings" },
    { segment: buildPath("overview"), title: "Overview", icon: <DashboardIcon /> },
    {
      segment: buildPath("chat"),
      title: "Chat",
      icon: <GroupsIcon />,
      action: hasUnreadMessages ? <NewMessagesChip /> : null,
    },
  ];

  if (canManageComms) {
    navigation.push(
      { segment: "dashboard/pharmacy-hub", title: "Pharmacy Hub", icon: <ForumIcon /> },
      { segment: buildPath("calendar"), title: "Calendar", icon: <CalendarMonthIcon /> }
    );
  }

  if (canManageAdmins) {
  }

  navigation.push({ kind: "divider" as const });

  if (canManageStaff || canManageRoster) {
    navigation.push({ kind: "header" as const, title: "Manage Pharmacies and Shifts" });
    if (canManageStaff) {
      navigation.push({
        segment: buildPath("manage-pharmacies"),
        title: "Manage Pharmacies",
        icon: <MedicationLiquidIcon />,
        children: [
          { segment: "my-pharmacies", title: "My Pharmacies", icon: <StoreIcon /> },
          { segment: "roster", title: "Internal Roster", icon: <EventAvailableIcon /> },
        ],
      });
    }
    if (canManageRoster) {
      navigation.push(
        { segment: buildPath("post-shift"), title: "Post Shift", icon: <PostAddIcon /> },
        {
          segment: buildPath("shift-center"),
          title: "Shift Centre",
          icon: <AccessTimeIcon />,
          children: [
            { segment: "active", title: "Active Shifts", icon: <PlayArrowIcon /> },
            { segment: "confirmed", title: "Confirmed Shifts", icon: <CheckCircleIcon /> },
            { segment: "history", title: "Shifts History", icon: <HistoryIcon /> },
          ],
        }
      );
    }
    navigation.push({ kind: "divider" as const });
  }

  navigation.push(
    { segment: buildPath("logout"), title: "Logout", icon: <LogoutIcon /> }
  );

  return navigation;
}


export function getOtherStaffNavDynamic(_progress_percent: number, workspace: 'internal' | 'platform', hasUnreadMessages: boolean) {
  // 1. Define dynamic children for the "Shifts" section, changing based on workspace
  const shiftsChildren = workspace === 'internal'
    ? [
      { segment: 'roster', title: 'My Roster', icon: <EventAvailableIcon /> },
      { segment: 'community', title: 'Community Shifts', icon: <GroupsIcon /> },
      { segment: 'confirmed', title: 'Confirmed Shifts', icon: <CheckCircleIcon /> },
      { segment: 'history', title: 'Shifts History', icon: <HistoryIcon /> },
    ]
    : [
      { segment: 'public', title: 'Public Shifts', icon: <PublicIcon /> },
      { segment: 'confirmed', title: 'Confirmed Shifts', icon: <CheckCircleIcon /> },
      { segment: 'history', title: 'Shifts History', icon: <HistoryIcon /> },
    ];

  // 2. Build and return the navigation array, matching the structure of the pharmacist nav
  return [
    // -- Profile Section --
    { kind: 'header' as const, title: 'Profile, Availability and Memberships' },
    { segment: 'dashboard/otherstaff/overview', title: 'Overview', icon: <DashboardIcon /> },
    // {
    //   segment: 'dashboard/otherstaff/onboarding',
    //   title: 'Profile',
    //   icon: <ManageAccountsSharpIcon />,
    //   action: (
    //     <Chip
    //       size="small"
    //       label={`${progress_percent}%`}
    //       color={progress_percent === 100 ? "success" : "default"}
    //       sx={{ ml: 0.5, fontWeight: 700 }}
    //     />
    //   ),
    // },
    {
      segment: 'dashboard/otherstaff/onboarding',
      title: 'Profile',
      icon: <ManageAccountsSharpIcon />,
      action: <ProfileStatusAction onboardingKey="otherstaff" progressPercent={_progress_percent} />,
    },
    {
      segment: 'dashboard/otherstaff/chat',
      title: 'Chat',
      icon: <GroupsIcon />,
      action: hasUnreadMessages ? <NewMessagesChip /> : null,
    },
    { segment: 'dashboard/pharmacy-hub', title: 'Pharmacy Hub', icon: <ForumIcon /> },
    { segment: 'dashboard/otherstaff/calendar', title: 'Calendar', icon: <CalendarMonthIcon /> },
    { segment: 'dashboard/otherstaff/interests?publish_availability=1', title: 'Publish Availability', icon: <PostAddIcon /> },
    { segment: 'dashboard/otherstaff/availability', title: 'Set Availability', icon: <EventAvailableIcon /> },
    { segment: 'dashboard/otherstaff/memberships', title: 'Manage Memberships', icon: <StoreIcon /> },

    // -- Divider & Shifts Section --
    { kind: 'divider' as const },
    { kind: 'header' as const, title: 'Shifts & Invoices' },
    {
      segment: 'dashboard/otherstaff/shifts',
      title: 'Shift Centre',
      icon: <AccessTimeIcon />,
      children: shiftsChildren,  // <-- Use the dynamic children defined above
    },
    { segment: 'dashboard/otherstaff/invoice', title: 'Manage Invoices', icon: <ReceiptIcon /> },

    // -- Divider & Learning Section --
    { kind: 'divider' as const },
    { kind: 'header' as const, title: 'Learning & Explorer Hub' },
    { segment: 'dashboard/otherstaff/interests', title: 'Talent Hub', icon: <PersonSearchIcon /> },
    { segment: 'dashboard/otherstaff/learning', title: 'Learning Materials', icon: <SchoolIcon /> },

    // -- Divider & Logout --
    { kind: 'divider' as const },
    { segment: 'dashboard/otherstaff/logout', title: 'Logout', icon: <LogoutIcon /> },
  ];
}


export function getPharmacistNavDynamic(_progress_percent: number, workspace: 'internal' | 'platform', hasUnreadMessages: boolean) {
  const shiftsChildren = workspace === 'internal'
    ? [
      { segment: 'roster', title: 'My Roster', icon: <EventAvailableIcon /> },
      { segment: 'community', title: 'Community Shifts', icon: <GroupsIcon /> },
      { segment: 'confirmed', title: 'Confirmed Shifts', icon: <CheckCircleIcon /> },
      { segment: 'history', title: 'Shifts History', icon: <HistoryIcon /> },

    ]
    : [
      { segment: 'public', title: 'Public Shifts', icon: <PublicIcon /> },
      { segment: 'confirmed', title: 'Confirmed Shifts', icon: <CheckCircleIcon /> },
      { segment: 'history', title: 'Shifts History', icon: <HistoryIcon /> },
    ];

  return [
    { kind: 'header' as const, title: 'Profile, Availability and Memberships' },
    { segment: 'dashboard/pharmacist/overview', title: 'Overview', icon: <DashboardIcon /> },
    // NEW: V2 onboarding � single sidebar item (tabs live inside the page)
    {
      segment: 'dashboard/pharmacist/onboarding',
      title: 'Profile',
      icon: <ManageAccountsSharpIcon />,
      action: <ProfileStatusAction onboardingKey="pharmacist" progressPercent={_progress_percent} />,
    },
    {
      segment: 'dashboard/pharmacist/chat',
      title: 'Chat',
      icon: <GroupsIcon />,
      action: hasUnreadMessages ? <NewMessagesChip /> : null,
    },
    { segment: 'dashboard/pharmacy-hub', title: 'Pharmacy Hub', icon: <ForumIcon /> },
    { segment: 'dashboard/pharmacist/calendar', title: 'Calendar', icon: <CalendarMonthIcon /> },
    { segment: 'dashboard/pharmacist/interests?publish_availability=1', title: 'Publish Availability', icon: <PostAddIcon /> },
    { segment: 'dashboard/pharmacist/availability', title: 'Set Availability', icon: <EventAvailableIcon /> },
    { segment: 'dashboard/pharmacist/memberships', title: 'Manage Memberships', icon: <StoreIcon /> },
    { kind: 'divider' as const },
    { kind: 'header' as const, title: 'Shifts & Invoices' },
    {
      segment: 'dashboard/pharmacist/shifts',
      title: 'Shift Centre',
      icon: <AccessTimeIcon />,
      children: shiftsChildren,
    },
    { segment: 'dashboard/pharmacist/invoice', title: 'Manage Invoices', icon: <ReceiptIcon /> },
    { kind: 'divider' as const },
    { kind: 'header' as const, title: 'Learning & Explorer Hub' },
    { segment: 'dashboard/pharmacist/interests', title: 'Talent Hub', icon: <PersonSearchIcon /> },
    { segment: 'dashboard/pharmacist/learning', title: 'Learning Materials', icon: <SchoolIcon /> },
    { kind: 'divider' as const },
    { segment: 'dashboard/pharmacist/logout', title: 'Logout', icon: <LogoutIcon /> },
  ];
}


export function getExplorerNav(_progress_percent: number, hasUnreadMessages: boolean) {
  return [
    { kind: 'header' as const, title: 'Profile settings' },
    { segment: 'dashboard/explorer/overview', title: 'Overview', icon: <DashboardIcon /> },

    {
      segment: 'dashboard/explorer/onboarding',
      title: 'Profile',
      icon: <ManageAccountsSharpIcon />,
      action: <ProfileStatusAction onboardingKey="explorer" progressPercent={_progress_percent} />,
    },

    {
      segment: 'dashboard/explorer/chat',
      title: 'Chat',
      icon: <GroupsIcon />,
      action: hasUnreadMessages ? <NewMessagesChip /> : null,
    },
    { kind: 'divider' as const },
    { kind: 'header' as const, title: 'Learning & Explorer Hub' },
    { segment: 'dashboard/explorer/calendar', title: 'Calendar', icon: <CalendarMonthIcon /> },
    { segment: 'dashboard/explorer/interests', title: 'Talent Hub', icon: <PersonSearchIcon /> },
    { segment: 'dashboard/explorer/learning', title: 'Learning Materials', icon: <SchoolIcon /> },
    { kind: 'divider' as const },
    { segment: 'dashboard/explorer/logout', title: 'Logout', icon: <LogoutIcon /> },
  ]
}
