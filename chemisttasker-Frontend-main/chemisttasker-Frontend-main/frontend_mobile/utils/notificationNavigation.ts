type NotificationPayload = Record<string, any>;

type ResolveRouteInput = {
  actionUrl?: string | null;
  payload?: NotificationPayload | null;
  userRole?: string | null;
};

const ROLE_ROUTE_MAP: Record<string, string> = {
  owner: '/owner/shifts',
  pharmacist: '/pharmacist/shifts',
  otherstaff: '/otherstaff/shifts',
  explorer: '/explorer/shifts',
  organization: '/organization/shifts',
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
  if (!actionUrl) return null;
  let path = actionUrl;
  let searchParams: URLSearchParams | null = null;
  try {
    const url = new URL(actionUrl, 'http://localhost');
    path = url.pathname || actionUrl;
    searchParams = url.searchParams;
  } catch {
    // ignore malformed URLs and treat as raw path
  }

  const match = path.match(/\/dashboard\/([^/]+)\/shifts(?:\/(?:active\/)?(\d+))?/);
  if (!match) return null;
  const roleSlug = match[1];
  const shiftId = Number(match[2]);
  const tab = searchParams?.get('tab') ?? null;
  const offerIdRaw = searchParams?.get('offer_id') ?? searchParams?.get('offerId') ?? null;
  const shiftIdFromQueryRaw = searchParams?.get('shift_id') ?? searchParams?.get('shiftId') ?? null;
  const offerId = offerIdRaw != null ? Number(offerIdRaw) : null;
  const shiftIdFromQuery = shiftIdFromQueryRaw != null ? Number(shiftIdFromQueryRaw) : null;

  return {
    roleSlug,
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
}: ResolveRouteInput): string | null => {
  const actionMatch = parseShiftFromActionUrl(actionUrl);
  const shiftId = actionMatch?.shiftId ?? parseShiftIdFromPayload(payload);
  const offerId = actionMatch?.offerId ?? parseOfferIdFromPayload(payload);
  const incomingTab = actionMatch?.tab ?? null;

  // Always prioritize the authenticated user's role when provided.
  // This prevents cross-role deep links (e.g. owner being sent to pharmacist routes)
  // when backend action URLs contain a mismatched role slug.
  const normalizedUserRole = normalizeRoleSlug(userRole);
  const roleSlug =
    normalizedUserRole ??
    actionMatch?.roleSlug ??
    null;

  const baseRoute = roleSlug ? ROLE_ROUTE_MAP[roleSlug] : null;
  if (!baseRoute) return null;

  const isWorkerRole = roleSlug === 'pharmacist' || roleSlug === 'otherstaff' || roleSlug === 'explorer';
  const shouldOpenOffers = isWorkerRole && (incomingTab === 'accepted' || offerId != null);
  if (shouldOpenOffers) {
    const params = new URLSearchParams();
    params.set('tab', 'accepted');
    if (shiftId != null) params.set('shift_id', String(shiftId));
    if (offerId != null) params.set('offer_id', String(offerId));
    return `${baseRoute}?${params.toString()}`;
  }

  if (!shiftId) return null;
  return `${baseRoute}/${shiftId}`;
};

export const resolveCalendarNotificationRoute = ({
  actionUrl,
  payload,
  userRole,
}: ResolveRouteInput): string | null => {
  const actionParams = parseCalendarFromActionUrl(actionUrl);
  const payloadParams = parseCalendarFromPayload(payload);
  const merged = {
    pharmacyId: actionParams?.pharmacyId ?? payloadParams?.pharmacyId ?? null,
    date: actionParams?.date ?? payloadParams?.date ?? null,
    noteId: actionParams?.noteId ?? payloadParams?.noteId ?? null,
  };

  if (!merged.pharmacyId && !merged.date && !merged.noteId) return null;

  const roleSlug = normalizeRoleSlug(userRole);
  const baseRoute = roleSlug ? ROLE_CALENDAR_ROUTE_MAP[roleSlug] : null;
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
