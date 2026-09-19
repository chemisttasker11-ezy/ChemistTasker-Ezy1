import type { NotificationItem } from "../api/notifications";

export type SearchOption = {
  label: string;
  path: string;
  keywords?: string[];
  description?: string;
};

export type PersonaMenuOption =
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

export const ADMIN_LEVEL_LABELS: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  ROSTER_MANAGER: "Roster Manager",
  COMMUNICATION_MANAGER: "Communications Manager",
};

export const ADMIN_STAFF_ROLE_LABELS: Record<string, string> = {
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

export const ROLE_SEARCH_OPTIONS: Record<string, SearchOption[]> = {
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

export const CHAT_ROUTES: Record<string, string> = {
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

export const PROFILE_ROUTES: Record<string, string> = {
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

export const DASHBOARD_ROUTES: Record<string, string> = {
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

export function onboardingRoleForUserRole(role?: string | null) {
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

export function profilePhotoFromSource(source: any) {
  return pickFirstString(
    source?.profile_photo_url,
    source?.profilePhotoUrl,
    source?.profile_photo,
    source?.profilePhoto,
    source?.avatar_url,
    source?.avatarUrl
  );
}

export type MessageSummary = {
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

export const isMessageNotification = (notification: NotificationItem): boolean => {
  const type = String(notification?.type || "").toLowerCase();
  if (type === "message") {
    return true;
  }
  return isChatNotificationPayload(notification?.payload);
};

export const normalizeNotification = (raw: any): NotificationItem => ({
  id: raw.id,
  type: raw.type,
  title: raw.title,
  body: raw.body,
  actionUrl: raw.actionUrl ?? raw.action_url ?? "",
  payload: raw.payload ?? {},
  createdAt: raw.createdAt ?? raw.created_at ?? "",
  readAt: raw.readAt ?? raw.read_at ?? null,
});

