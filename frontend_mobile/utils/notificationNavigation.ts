import {
  isWorkerPersona,
  parseShiftLink,
  shiftPersonaFromRole,
  shiftRoute,
  type ShiftPersona,
} from '@/roles/shared/shifts/shiftSurface';

type NotificationPayload = Record<string, any>;

type ResolveRouteInput = {
  actionUrl?: string | null;
  payload?: NotificationPayload | null;
  userRole?: string | null;
  /** The active shell (shiftPersonaFromPath); wins over userRole so a delegated admin stays in /admin. */
  persona?: ShiftPersona | null;
  /** useAdminCan(): the capability check on the active admin pharmacy. /admin wins only when it allows the destination. */
  adminCan?: ((capability: string) => boolean) | null;
};

// The /admin route guards (app/_layout.tsx AuthGate, app/admin/_layout.tsx): shifts need MANAGE_ROSTER; calendar needs
// MANAGE_COMMUNICATIONS, MANAGE_STAFF or MANAGE_ROSTER. Without them the tap opens the base role's own screen.
const ADMIN_GUARDS = {
  shifts: ['MANAGE_ROSTER'],
  calendar: ['MANAGE_COMMUNICATIONS', 'MANAGE_STAFF', 'MANAGE_ROSTER'],
} as const;

const activeShell = (
  persona: ShiftPersona | null | undefined,
  adminCan: ResolveRouteInput['adminCan'],
  area: keyof typeof ADMIN_GUARDS,
): ShiftPersona | null => {
  if (persona !== 'admin') return persona ?? null;
  return ADMIN_GUARDS[area].some((capability) => adminCan?.(capability)) ? persona : null;
};

const ROLE_CALENDAR_ROUTE_MAP: Record<string, string> = {
  owner: '/owner/calendar',
  pharmacist: '/pharmacist/calendar',
  otherstaff: '/otherstaff/calendar',
  explorer: '/explorer/calendar',
  organization: '/organization/calendar',
};

const ROLE_HUB_ROUTE_MAP: Record<string, string> = {
  owner: '/owner/hub',
  pharmacist: '/pharmacist/hub',
  otherstaff: '/otherstaff/hub',
};

const ROLE_MEMBERSHIP_ROUTE_MAP: Record<string, string> = {
  owner: '/owner/pharmacies',
  pharmacist: '/pharmacist/memberships',
  otherstaff: '/otherstaff/memberships',
  organization: '/organization/pharmacies',
  admin: '/admin/pharmacies',
};

const normalizeRoleSlug = (rawRole?: string | null): string | null => {
  if (!rawRole) return null;
  const upper = String(rawRole).toUpperCase();
  if (upper === 'OWNER') return 'owner';
  if (upper === 'PHARMACIST') return 'pharmacist';
  if (upper === 'OTHER_STAFF') return 'otherstaff';
  if (upper === 'EXPLORER') return 'explorer';
  if (upper.startsWith('ORG_')) return 'organization';
  if (upper === 'ORG_ADMIN') return 'organization';
  return rawRole.toLowerCase();
};

const parseShiftFromActionUrl = (actionUrl?: string | null) => {
  const link = parseShiftLink(actionUrl);
  if (!link) return null;
  let searchParams: URLSearchParams | null = null;
  try {
    searchParams = new URL(actionUrl!, 'http://localhost').searchParams;
  } catch {
    // ignore malformed URLs: the path alone still names the shift
  }

  const shiftId = link.shiftId ?? NaN;
  const tab = searchParams?.get('tab') ?? null;
  const offerIdRaw = searchParams?.get('offer_id') ?? searchParams?.get('offerId') ?? null;
  const shiftIdFromQueryRaw = searchParams?.get('shift_id') ?? searchParams?.get('shiftId') ?? null;
  const offerId = offerIdRaw != null ? Number(offerIdRaw) : null;
  const shiftIdFromQuery = shiftIdFromQueryRaw != null ? Number(shiftIdFromQueryRaw) : null;

  return {
    link,
    shiftId: Number.isFinite(shiftId) ? shiftId : (Number.isFinite(shiftIdFromQuery) ? shiftIdFromQuery : null),
    tab,
    offerId: Number.isFinite(offerId) ? offerId : null,
  };
};

const parseShiftIdFromPayload = (payload?: NotificationPayload | null) => {
  if (!payload) return null;
  const raw =
    payload.shift_id ??
    payload.shiftId ??
    payload.shift ??
    payload.shiftID ??
    null;
  const parsed = typeof raw === 'string' ? Number(raw) : raw;
  if (!Number.isFinite(parsed)) return null;
  return Number(parsed);
};

const parseOfferIdFromPayload = (payload?: NotificationPayload | null) => {
  if (!payload) return null;
  const raw = payload.offer_id ?? payload.offerId ?? null;
  const parsed = typeof raw === 'string' ? Number(raw) : raw;
  if (!Number.isFinite(parsed)) return null;
  return Number(parsed);
};

const parseConversationIdFromPayload = (payload?: NotificationPayload | null) => {
  if (!payload) return null;
  const raw =
    payload.conversation_id ??
    payload.conversationId ??
    payload.roomId ??
    payload.room_id ??
    payload.chat_room_id ??
    null;
  const parsed = typeof raw === 'string' ? Number(raw) : raw;
  if (!Number.isFinite(parsed)) return null;
  return Number(parsed);
};

const parseConversationIdFromActionUrl = (actionUrl?: string | null) => {
  if (!actionUrl) return null;
  try {
    const url = new URL(actionUrl, 'http://localhost');
    const raw = url.searchParams.get('conversationId') || url.searchParams.get('conversation_id');
    const parsed = raw ? Number(raw) : null;
    if (!Number.isFinite(parsed)) return null;
    return Number(parsed);
  } catch {
    return null;
  }
};

const parseCalendarFromActionUrl = (actionUrl?: string | null) => {
  if (!actionUrl) return null;
  try {
    const url = new URL(actionUrl, 'http://localhost');
    if (!url.pathname.includes('/dashboard/calendar')) return null;
    return {
      pharmacyId: url.searchParams.get('pharmacy_id') || url.searchParams.get('pharmacyId') || null,
      date: url.searchParams.get('date') || null,
      noteId: url.searchParams.get('note_id') || url.searchParams.get('noteId') || null,
    };
  } catch {
    return null;
  }
};

const parseCalendarFromPayload = (payload?: NotificationPayload | null) => {
  if (!payload) return null;
  const noteRaw = payload.note_id ?? payload.noteId ?? payload.work_note_id ?? payload.workNoteId ?? null;
  const pharmacyRaw = payload.pharmacy_id ?? payload.pharmacyId ?? null;
  const dateRaw = payload.date ?? null;
  return {
    pharmacyId: pharmacyRaw ? String(pharmacyRaw) : null,
    date: dateRaw ? String(dateRaw) : null,
    noteId: noteRaw ? String(noteRaw) : null,
  };
};

const parseHubFromActionUrl = (actionUrl?: string | null) => {
  if (!actionUrl) return null;
  try {
    const url = new URL(actionUrl, 'http://localhost');
    if (!url.pathname.includes('/dashboard/pharmacy-hub')) return null;
    return {
      scope: url.searchParams.get('scope') || null,
      pharmacyId: url.searchParams.get('pharmacy_id') || null,
      organizationId: url.searchParams.get('organization_id') || null,
      groupId: url.searchParams.get('group_id') || null,
      platformHub: url.searchParams.get('platform_hub') || null,
      postId: url.searchParams.get('post') || null,
    };
  } catch {
    return null;
  }
};

const parseHubFromPayload = (payload?: NotificationPayload | null) => {
  if (!payload) return null;
  return {
    scope: payload.scope ? String(payload.scope) : null,
    pharmacyId: payload.pharmacy_id ?? payload.pharmacyId ?? null,
    organizationId: payload.organization_id ?? payload.organizationId ?? null,
    groupId: payload.group_id ?? payload.groupId ?? null,
    platformHub: payload.platform_hub ?? payload.platformHub ?? null,
    postId: payload.post_id ?? payload.postId ?? null,
  };
};

const parseMembershipFromActionUrl = (actionUrl?: string | null) => {
  if (!actionUrl) return null;
  try {
    const url = new URL(actionUrl, 'http://localhost');
    const path = url.pathname || '';
    if (!path.includes('/memberships') && !path.includes('/manage-pharmacies/my-pharmacies')) {
      return null;
    }
    const adminMatch = path.match(/\/dashboard\/admin\/(\d+)\/manage-pharmacies\/my-pharmacies\/?/);
    return {
      isWorkerMembershipPage: path.includes('/memberships'),
      pharmacyId:
        url.searchParams.get('pharmacyId') ||
        url.searchParams.get('pharmacy_id') ||
        adminMatch?.[1] ||
        null,
    };
  } catch {
    return null;
  }
};

const parseMembershipFromPayload = (payload?: NotificationPayload | null) => {
  if (!payload) return null;
  const pharmacyId = payload.pharmacy_id ?? payload.pharmacyId ?? null;
  const membershipId = payload.membership_id ?? payload.membershipId ?? null;
  if (pharmacyId == null && membershipId == null) return null;
  return {
    isWorkerMembershipPage: true,
    pharmacyId: pharmacyId != null ? String(pharmacyId) : null,
  };
};

export const resolveChatNotificationRoomId = ({
  actionUrl,
  payload,
}: ResolveRouteInput): number | null => {
  return parseConversationIdFromPayload(payload) ?? parseConversationIdFromActionUrl(actionUrl);
};

export const resolveShiftNotificationRoute = ({
  actionUrl,
  payload,
  userRole,
  persona,
  adminCan,
}: ResolveRouteInput): string | null => {
  const actionMatch = parseShiftFromActionUrl(actionUrl);
  const shiftId = actionMatch?.shiftId ?? parseShiftIdFromPayload(payload);
  const offerId = actionMatch?.offerId ?? parseOfferIdFromPayload(payload);
  const incomingTab = actionMatch?.tab ?? null;

  // The active shell first (when its guard allows it), then the signed-in role, and the URL's role slug only when
  // neither is known: backend action URLs can name another role (an owner's link reaching a delegated admin).
  const target =
    activeShell(persona, adminCan, 'shifts') ??
    (userRole ? shiftPersonaFromRole(userRole) : actionMatch?.link.persona ?? null);
  if (!target) return null;
  const baseRoute = `/${target}/shifts`;

  const link = actionMatch?.link;
  const suffix = link?.suffix ?? '';
  const shouldOpenOffers = isWorkerPersona(target) && (incomingTab === 'accepted' || offerId != null);
  if (shouldOpenOffers) {
    // Merge the offer params into the incoming query (fragment kept), so other params survive.
    const hashAt = suffix.indexOf('#');
    const params = new URLSearchParams(hashAt < 0 ? suffix : suffix.slice(0, hashAt));
    params.set('tab', 'accepted');
    if (shiftId != null) params.set('shift_id', String(shiftId));
    if (offerId != null) params.set('offer_id', String(offerId));
    return shiftRoute(target, { section: link?.section, suffix: `?${params.toString()}${hashAt < 0 ? '' : suffix.slice(hashAt)}` });
  }

  // A detail path keeps its query; a shift id taken from the query (an offer link) opens the bare detail.
  if (shiftId) return shiftRoute(target, { shiftId, suffix: link?.shiftId != null ? suffix : '' });
  // Section and board links (/shift-center/active, /shifts/roster) open that section, query kept.
  return link ? shiftRoute(target, { section: link.section, suffix }) : null;
};

export const resolveCalendarNotificationRoute = ({
  actionUrl,
  payload,
  userRole,
  persona,
  adminCan,
}: ResolveRouteInput): string | null => {
  const actionParams = parseCalendarFromActionUrl(actionUrl);
  // Shift notifications (cancellations carry shift_id + date) open the shift, never the calendar.
  if (!actionParams && (parseShiftLink(actionUrl) || parseShiftIdFromPayload(payload) != null || parseOfferIdFromPayload(payload) != null)) {
    return null;
  }
  const payloadParams = parseCalendarFromPayload(payload);
  const merged = {
    pharmacyId: actionParams?.pharmacyId ?? payloadParams?.pharmacyId ?? null,
    date: actionParams?.date ?? payloadParams?.date ?? null,
    noteId: actionParams?.noteId ?? payloadParams?.noteId ?? null,
  };

  if (!merged.pharmacyId && !merged.date && !merged.noteId) return null;

  const roleSlug = normalizeRoleSlug(userRole);
  // Every shell has a calendar (/admin/calendar too); the active shell wins over the role when its guard allows it.
  const shell = activeShell(persona, adminCan, 'calendar');
  // Base-role fallback by persona so CHIEF_ADMIN / REGION_ADMIN reach /organization/calendar.
  const rolePersona = shiftPersonaFromRole(userRole);
  const baseRoute = shell
    ? `/${shell}/calendar`
    : (rolePersona ? ROLE_CALENDAR_ROUTE_MAP[rolePersona] : null) ?? (roleSlug ? ROLE_CALENDAR_ROUTE_MAP[roleSlug] : null);
  if (!baseRoute) return null;

  const params = new URLSearchParams();
  if (merged.pharmacyId) params.set('pharmacy_id', String(merged.pharmacyId));
  if (merged.date) params.set('date', String(merged.date));
  if (merged.noteId) params.set('note_id', String(merged.noteId));

  const query = params.toString();
  return query ? `${baseRoute}?${query}` : baseRoute;
};

export const resolveHubNotificationRoute = ({
  actionUrl,
  payload,
  userRole,
}: ResolveRouteInput): string | null => {
  const roleSlug = normalizeRoleSlug(userRole);
  const baseRoute = roleSlug ? ROLE_HUB_ROUTE_MAP[roleSlug] : null;
  if (!baseRoute) return null;

  const actionParams = parseHubFromActionUrl(actionUrl);
  const payloadParams = parseHubFromPayload(payload);
  const merged = {
    scope: actionParams?.scope ?? payloadParams?.scope ?? null,
    pharmacyId: actionParams?.pharmacyId ?? payloadParams?.pharmacyId ?? null,
    organizationId: actionParams?.organizationId ?? payloadParams?.organizationId ?? null,
    groupId: actionParams?.groupId ?? payloadParams?.groupId ?? null,
    platformHub: actionParams?.platformHub ?? payloadParams?.platformHub ?? null,
    postId: actionParams?.postId ?? payloadParams?.postId ?? null,
  };

  if (!merged.scope && !merged.postId) return null;

  const params = new URLSearchParams();
  if (merged.scope) params.set('scope', String(merged.scope));
  if (merged.pharmacyId != null) params.set('pharmacy_id', String(merged.pharmacyId));
  if (merged.organizationId != null) params.set('organization_id', String(merged.organizationId));
  if (merged.groupId != null) params.set('group_id', String(merged.groupId));
  if (merged.platformHub) params.set('platform_hub', String(merged.platformHub));
  if (merged.postId != null) params.set('post', String(merged.postId));

  const query = params.toString();
  return query ? `${baseRoute}?${query}` : baseRoute;
};

export const resolveMembershipNotificationRoute = ({
  actionUrl,
  payload,
  userRole,
}: ResolveRouteInput): string | null => {
  const roleSlug = normalizeRoleSlug(userRole);
  const parsed = parseMembershipFromActionUrl(actionUrl) ?? parseMembershipFromPayload(payload);
  if (!roleSlug || !parsed) return null;

  if (roleSlug === 'pharmacist' || roleSlug === 'otherstaff') {
    return ROLE_MEMBERSHIP_ROUTE_MAP[roleSlug];
  }

  const pharmacyId = parsed.pharmacyId ?? payload?.pharmacy_id ?? payload?.pharmacyId ?? null;
  if (roleSlug === 'owner' && pharmacyId != null) {
    return `/owner/pharmacies/${pharmacyId}`;
  }
  if (roleSlug === 'organization' && pharmacyId != null) {
    return `/organization/pharmacies/${pharmacyId}`;
  }
  if (roleSlug === 'admin' && pharmacyId != null) {
    return `/admin/pharmacies/${pharmacyId}`;
  }

  return ROLE_MEMBERSHIP_ROUTE_MAP[roleSlug] ?? null;
};
