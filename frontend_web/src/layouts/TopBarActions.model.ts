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
    role: "PHARMACIST" | "OTHER_STAFF" | "OWNER" | "EXPLORER";
    label: string;
    helper?: string;
  }
  | { key: "ORG"; kind: "ORG"; label: string; helper?: string }
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
