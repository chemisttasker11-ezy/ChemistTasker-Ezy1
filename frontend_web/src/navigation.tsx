// src/navigation.tsx
import { Navigation } from "@toolpad/core";
import { Briefcase, Building2, Calendar, CalendarCheck, CalendarClock, CalendarPlus, CircleCheck, CircleUserRound, ClipboardCheck, Clock, Clock3, Globe, GraduationCap, History, IdCard, LayoutGrid, LogOut, MessageCircle, MessageSquareText, Pill, Play, ReceiptText, SquarePlus, Store, Timer, UserCog, UserPlus, UserSearch, Users } from "lucide-react";
// import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
// import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import VerifiedRoundedIcon from "@mui/icons-material/VerifiedRounded";
import HourglassEmptyRoundedIcon from "@mui/icons-material/HourglassEmptyRounded";
import type { AdminAssignment } from "./contexts/AuthContext";
import {
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

export function getOrganizationNav(hasUnreadMessages: boolean, capabilities: unknown[] = []): Navigation {
  const capabilitySet = new Set(capabilities.map((capability) => String(capability)));
  const canManageRoster = capabilitySet.has("manage_roster");
  const canManageStaff = capabilitySet.has("manage_staff");
  const canManageComms = capabilitySet.has("manage_communications");
  const canInviteStaff = capabilitySet.has("invite_staff");
  const canManagePharmacies =
    canManageStaff ||
    capabilitySet.has("view_all_pharmacies") ||
    capabilitySet.has("assign_pharmacies");

  const navigation: Navigation = [
    { kind: "header" as const, title: "Organization Management" },
    { segment: "dashboard/organization/overview", title: "Overview", icon: <LayoutGrid /> },
  ];

  if (canInviteStaff) {
    navigation.push({ segment: "dashboard/organization/invite", title: "Invite Staff", icon: <UserPlus /> });
  }
  if (canManageComms) {
    navigation.push(
      {
        segment: "dashboard/organization/chat",
        title: "Chat",
        icon: <MessageCircle />,
        action: hasUnreadMessages ? <NewMessagesChip /> : null,
      },
      { segment: "dashboard/pharmacy-hub", title: "Pharmacy Hub", icon: <MessageSquareText /> },
      { segment: "dashboard/organization/calendar", title: "Calendar", icon: <Calendar /> },
    );
  }

  if (canManagePharmacies || canManageRoster) {
    navigation.push(
      { kind: "divider" as const },
      { kind: "header" as const, title: "Manage Pharmacies and Shifts" },
    );
  }

  if (canManagePharmacies) {
    const children: Navigation = [
      { segment: "my-pharmacies", title: "My Pharmacies", icon: <Store /> },
    ];
    if (capabilitySet.has("view_all_pharmacies")) {
      children.push({ segment: "my-chain", title: "My Chain", icon: <Building2 /> });
    }
    if (canManageRoster) {
      children.push({ segment: "roster", title: "Internal Roster", icon: <CalendarCheck /> });
    }
    if (canManageStaff || canManageRoster) {
      children.push({ segment: "attendance-reviews", title: "Attendance Approvals", icon: <ClipboardCheck /> });
    }
    navigation.push({
      segment: "dashboard/organization/manage-pharmacies",
      title: "Manage Pharmacies",
      icon: <Pill />,
      children,
    });
  }

  if (canManageStaff) {
    navigation.push({ segment: "dashboard/workforce/settings", title: "Workforce & Payroll", icon: <UserCog /> });
  }
  if (canManageRoster) {
    navigation.push(
      { segment: "dashboard/organization/post-shift", title: "Post Shift", icon: <SquarePlus /> },
      { segment: "dashboard/workforce/timesheets", title: "Timesheets", icon: <Clock3 /> },
      {
        segment: "dashboard/organization/shift-center",
        title: "Shift Centre",
        icon: <Clock />,
        children: [
          { segment: "active", title: "Active Shifts", icon: <Play /> },
          { segment: "confirmed", title: "Confirmed Shifts", icon: <CircleCheck /> },
          { segment: "history", title: "Shifts History", icon: <History /> },
        ],
      },
    );
  }

  navigation.push(
    { kind: "divider" as const },
    { kind: "header" as const, title: "Learning & Explorer Hub" },
    { segment: "dashboard/organization/interests", title: "Talent Hub", icon: <UserSearch /> },
    { segment: "dashboard/organization/learning", title: "Learning Materials", icon: <GraduationCap /> },
    { kind: "divider" as const },
    { segment: "dashboard/organization/logout", title: "Logout", icon: <LogOut /> },
  );

  return navigation;
}

export function getOwnerNav(progressPercent: number, hasUnreadMessages: boolean): Navigation {
  return [
    { kind: "header" as const, title: "Profile Settings" },
    { segment: "dashboard/owner/overview", title: "Overview", icon: <LayoutGrid /> },
    {
      segment: "dashboard/owner/onboarding",
      title: "Profile",
      icon: <CircleUserRound />,
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
      icon: <MessageCircle />,
      action: hasUnreadMessages ? <NewMessagesChip /> : null,
    },
    { segment: "dashboard/pharmacy-hub", title: "Pharmacy Hub", icon: <MessageSquareText /> },
    { segment: "dashboard/owner/calendar", title: "Calendar", icon: <Calendar /> },
    { kind: "divider" as const },
    { kind: "header" as const, title: "Manage Pharmacies and Shifts" },
    {
      segment: "dashboard/owner/manage-pharmacies",
      title: "Manage Pharmacies",
      icon: <Pill />,
      children: [
        { segment: "my-pharmacies", title: "My Pharmacies", icon: <Store /> },
        { segment: "my-chain", title: "My Chain", icon: <Building2 /> },
        { segment: "roster", title: "Internal Roster", icon: <CalendarCheck /> },
        { segment: "attendance-reviews", title: "Attendance Approvals", icon: <ClipboardCheck /> },
      ],
    },
    { segment: "dashboard/owner/post-shift", title: "Post Shift", icon: <SquarePlus /> },
    { segment: "dashboard/workforce/timesheets", title: "Timesheets", icon: <Clock3 /> },
    { segment: "dashboard/workforce/settings", title: "Workforce & Payroll", icon: <UserCog /> },
    {
      segment: "dashboard/owner/shift-center",
      title: "Shift Centre",
      icon: <Clock />,
      children: [
        { segment: "active", title: "Active Shifts", icon: <Play /> },
        { segment: "confirmed", title: "Confirmed Shifts", icon: <CircleCheck /> },
        { segment: "history", title: "Shifts History", icon: <History /> },
      ],
    },
    { segment: "dashboard/owner/invoice", title: "Invoices", icon: <ReceiptText /> },
    { kind: "divider" as const },
    { kind: "header" as const, title: "Learning & Explorer Hub" },
    { segment: "dashboard/owner/interests", title: "Talent Hub", icon: <UserSearch /> },
    { segment: "dashboard/owner/learning", title: "Learning Materials", icon: <GraduationCap /> },
    { kind: "divider" as const },
    { segment: "dashboard/owner/logout", title: "Logout", icon: <LogOut /> },
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
    { segment: buildPath("overview"), title: "Overview", icon: <LayoutGrid /> },
    {
      segment: buildPath("chat"),
      title: "Chat",
      icon: <MessageCircle />,
      action: hasUnreadMessages ? <NewMessagesChip /> : null,
    },
  ];

  if (canManageComms) {
    navigation.push(
      { segment: "dashboard/pharmacy-hub", title: "Pharmacy Hub", icon: <MessageSquareText /> },
      { segment: buildPath("calendar"), title: "Calendar", icon: <Calendar /> }
    );
  }

  navigation.push({ kind: "divider" as const });

  if (canManageStaff || canManageRoster) {
    navigation.push({ kind: "header" as const, title: "Manage Pharmacies and Shifts" });
    if (canManageStaff) {
      const manageChildren: Navigation = [
        { segment: "my-pharmacies", title: "My Pharmacies", icon: <Store /> },
      ];
      if (canManageRoster) {
        manageChildren.push(
          { segment: "roster", title: "Internal Roster", icon: <CalendarCheck /> },
          { segment: "attendance-reviews", title: "Attendance Approvals", icon: <ClipboardCheck /> },
        );
      }
      navigation.push({
        segment: buildPath("manage-pharmacies"),
        title: "Manage Pharmacies",
        icon: <Pill />,
        children: manageChildren,
      });
      navigation.push(
        { segment: "dashboard/workforce/settings", title: "Workforce & Payroll", icon: <UserCog /> },
      );
    }
    if (canManageRoster) {
      navigation.push(
        { segment: buildPath("post-shift"), title: "Post Shift", icon: <SquarePlus /> },
        { segment: "dashboard/workforce/timesheets", title: "Timesheets", icon: <Clock3 /> },
        {
          segment: buildPath("shift-center"),
          title: "Shift Centre",
          icon: <Clock />,
          children: [
            { segment: "active", title: "Active Shifts", icon: <Play /> },
            { segment: "confirmed", title: "Confirmed Shifts", icon: <CircleCheck /> },
            { segment: "history", title: "Shifts History", icon: <History /> },
          ],
        }
      );
    }
    navigation.push({ kind: "divider" as const });
  }

  navigation.push(
    { segment: buildPath("logout"), title: "Logout", icon: <LogOut /> }
  );

  return navigation;
}


export function getOtherStaffNavDynamic(_progress_percent: number, workspace: 'internal' | 'platform', hasUnreadMessages: boolean) {
  // 1. Define dynamic children for the "Shifts" section, changing based on workspace
  const shiftsChildren = workspace === 'internal'
    ? [
      { segment: 'roster', title: 'My Roster', icon: <CalendarCheck /> },
      { segment: 'community', title: 'Community Shifts', icon: <Users /> },
      { segment: 'confirmed', title: 'Confirmed Shifts', icon: <CircleCheck /> },
      { segment: 'history', title: 'Shifts History', icon: <History /> },
    ]
    : [
      { segment: 'public', title: 'Public Shifts', icon: <Globe /> },
      { segment: 'confirmed', title: 'Confirmed Shifts', icon: <CircleCheck /> },
      { segment: 'history', title: 'Shifts History', icon: <History /> },
    ];

  // 2. Build and return the navigation array, matching the structure of the pharmacist nav
  return [
    // -- Profile Section --
    { kind: 'header' as const, title: 'Profile, Availability and Memberships' },
    { segment: 'dashboard/otherstaff/overview', title: 'Overview', icon: <LayoutGrid /> },
    // {
    //   segment: 'dashboard/otherstaff/onboarding',
    //   title: 'Profile',
    //   icon: <CircleUserRound />,
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
      icon: <CircleUserRound />,
      action: <ProfileStatusAction onboardingKey="otherstaff" progressPercent={_progress_percent} />,
    },
    {
      segment: 'dashboard/otherstaff/chat',
      title: 'Chat',
      icon: <MessageCircle />,
      action: hasUnreadMessages ? <NewMessagesChip /> : null,
    },
    { segment: 'dashboard/pharmacy-hub', title: 'Pharmacy Hub', icon: <MessageSquareText /> },
    { segment: 'dashboard/otherstaff/calendar', title: 'Calendar', icon: <Calendar /> },
    { segment: 'dashboard/otherstaff/interests?publish_availability=1', title: 'Publish Availability', icon: <CalendarPlus /> },
    { segment: 'dashboard/otherstaff/availability', title: 'Set Availability', icon: <CalendarClock /> },
    { segment: 'dashboard/otherstaff/attendance', title: 'My Attendance', icon: <Timer /> },
    { segment: 'dashboard/my-hours', title: 'My Hours', icon: <Clock3 /> },
    { segment: 'dashboard/otherstaff/memberships', title: 'Manage Memberships', icon: <IdCard /> },

    // -- Divider & Shifts Section --
    { kind: 'divider' as const },
    { kind: 'header' as const, title: 'Shifts & Invoices' },
    {
      segment: 'dashboard/otherstaff/shifts',
      title: 'Shift Centre',
      icon: <Clock />,
      children: shiftsChildren,  // <-- Use the dynamic children defined above
    },
    { segment: 'dashboard/otherstaff/invoice', title: 'Manage Invoices', icon: <ReceiptText /> },

    // -- Divider & Learning Section --
    { kind: 'divider' as const },
    { kind: 'header' as const, title: 'Learning & Explorer Hub' },
    { segment: 'dashboard/otherstaff/interests', title: 'Talent Hub', icon: <UserSearch /> },
    { segment: 'dashboard/otherstaff/learning', title: 'Learning Materials', icon: <GraduationCap /> },

    // -- Divider & Logout --
    { kind: 'divider' as const },
    { segment: 'dashboard/otherstaff/logout', title: 'Logout', icon: <LogOut /> },
  ];
}


export function getPharmacistNavDynamic(_progress_percent: number, workspace: 'internal' | 'platform', hasUnreadMessages: boolean) {
  const shiftsChildren = workspace === 'internal'
    ? [
      { segment: 'roster', title: 'My Roster', icon: <CalendarCheck /> },
      { segment: 'community', title: 'Community Shifts', icon: <Users /> },
      { segment: 'confirmed', title: 'Confirmed Shifts', icon: <CircleCheck /> },
      { segment: 'history', title: 'Shifts History', icon: <History /> },

    ]
    : [
      { segment: 'public', title: 'Public Shifts', icon: <Globe /> },
      { segment: 'confirmed', title: 'Confirmed Shifts', icon: <CircleCheck /> },
      { segment: 'history', title: 'Shifts History', icon: <History /> },
    ];

  return [
    { kind: 'header' as const, title: 'Profile, Availability and Memberships' },
    { segment: 'dashboard/pharmacist/overview', title: 'Overview', icon: <LayoutGrid /> },
    // NEW: V2 onboarding � single sidebar item (tabs live inside the page)
    {
      segment: 'dashboard/pharmacist/onboarding',
      title: 'Profile',
      icon: <CircleUserRound />,
      action: <ProfileStatusAction onboardingKey="pharmacist" progressPercent={_progress_percent} />,
    },
    {
      segment: 'dashboard/pharmacist/chat',
      title: 'Chat',
      icon: <MessageCircle />,
      action: hasUnreadMessages ? <NewMessagesChip /> : null,
    },
    { segment: 'dashboard/pharmacy-hub', title: 'Pharmacy Hub', icon: <MessageSquareText /> },
    { segment: 'dashboard/pharmacist/calendar', title: 'Calendar', icon: <Calendar /> },
    { segment: 'dashboard/pharmacist/interests?publish_availability=1', title: 'Publish Availability', icon: <CalendarPlus /> },
    { segment: 'dashboard/pharmacist/availability', title: 'Set Availability', icon: <CalendarClock /> },
    { segment: 'dashboard/pharmacist/attendance', title: 'My Attendance', icon: <Timer /> },
    { segment: 'dashboard/my-hours', title: 'My Hours', icon: <Clock3 /> },
    { segment: 'dashboard/pharmacist/memberships', title: 'Manage Memberships', icon: <IdCard /> },
    { kind: 'divider' as const },
    { kind: 'header' as const, title: 'Shifts & Invoices' },
    {
      segment: 'dashboard/pharmacist/shifts',
      title: 'Shift Centre',
      icon: <Clock />,
      children: shiftsChildren,
    },
    { segment: 'dashboard/pharmacist/invoice', title: 'Manage Invoices', icon: <ReceiptText /> },
    { kind: 'divider' as const },
    { kind: 'header' as const, title: 'Learning & Explorer Hub' },
    { segment: 'dashboard/pharmacist/interests', title: 'Talent Hub', icon: <UserSearch /> },
    { segment: 'dashboard/pharmacist/learning', title: 'Learning Materials', icon: <GraduationCap /> },
    { kind: 'divider' as const },
    { segment: 'dashboard/pharmacist/logout', title: 'Logout', icon: <LogOut /> },
  ];
}


export function getExplorerNav(_progress_percent: number, hasUnreadMessages: boolean) {
  return [
    { kind: 'header' as const, title: 'Profile settings' },
    { segment: 'dashboard/explorer/overview', title: 'Overview', icon: <LayoutGrid /> },
    {
      segment: 'dashboard/explorer/onboarding',
      title: 'Profile',
      icon: <CircleUserRound />,
      action: <ProfileStatusAction onboardingKey="explorer" progressPercent={_progress_percent} />,
    },
    {
      segment: 'dashboard/explorer/chat',
      title: 'Chat',
      icon: <MessageCircle />,
      action: hasUnreadMessages ? <NewMessagesChip /> : null,
    },
    { kind: 'divider' as const },
    { kind: 'header' as const, title: 'Opportunities' },
    {
      segment: 'dashboard/explorer/shifts',
      title: 'Shifts',
      icon: <Briefcase />,
      children: [
        { segment: 'public', title: 'Public Shifts', icon: <Globe /> },
        { segment: 'community', title: 'Community Shifts', icon: <Users /> },
      ],
    },
    { segment: 'dashboard/explorer/interests', title: 'Talent Hub', icon: <UserSearch /> },
    { kind: 'divider' as const },
    { kind: 'header' as const, title: 'Learning & Community' },
    { segment: 'dashboard/explorer/calendar', title: 'Calendar', icon: <Calendar /> },
    { segment: 'dashboard/explorer/learning', title: 'Learning Materials', icon: <GraduationCap /> },
    { kind: 'divider' as const },
    { segment: 'dashboard/explorer/logout', title: 'Logout', icon: <LogOut /> },
  ]
}
