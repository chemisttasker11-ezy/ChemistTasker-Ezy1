// Shift surface policy shared by every persona's shift screens. No runtime imports, so the node test can load it.

/** The six shift personas, named by their mobile route prefix (/owner, /organization, /admin, ...). */
export const SHIFT_PERSONAS = ['owner', 'organization', 'admin', 'pharmacist', 'otherstaff', 'explorer'] as const;
export type ShiftPersona = (typeof SHIFT_PERSONAS)[number];

/** Sections a web shift link can name: /shifts/<section> and /shift-center/<section>. */
export const SHIFT_SECTIONS = ['public', 'community', 'active', 'confirmed', 'history', 'roster'] as const;
export type ShiftSection = (typeof SHIFT_SECTIONS)[number];

export type ShiftWorkspace = 'internal' | 'platform';

/** True for a mobile persona route prefix. */
export const isShiftPersona = (value: unknown): value is ShiftPersona => SHIFT_PERSONAS.includes(value as ShiftPersona);

/** Workers browse and book shifts; posters (owner, organization, admin) post and manage them. */
export const isWorkerPersona = (persona: ShiftPersona | null) =>
  persona === 'pharmacist' || persona === 'otherstaff' || persona === 'explorer';

/** The persona whose shell a route belongs to ('/admin/notifications' -> 'admin'); null for shared routes. */
export function shiftPersonaFromPath(pathname?: string | null): ShiftPersona | null {
  const top = String(pathname ?? '').split(/[?#]/)[0].split('/').filter(Boolean)[0];
  return isShiftPersona(top) ? top : null;
}

/** The persona a base role opens in. Fallback only: a delegated admin keeps role PHARMACIST, OWNER etc. */
export function shiftPersonaFromRole(role?: string | null): ShiftPersona | null {
  const raw = String(role ?? '');
  if (isShiftPersona(raw)) return raw;
  const upper = raw.toUpperCase();
  if (upper === 'OWNER') return 'owner';
  if (upper === 'PHARMACIST') return 'pharmacist';
  if (upper === 'OTHER_STAFF') return 'otherstaff';
  if (upper === 'EXPLORER') return 'explorer';
  if (upper === 'ORGANIZATION' || upper.startsWith('ORG_') || upper === 'CHIEF_ADMIN' || upper === 'REGION_ADMIN') return 'organization';
  if (upper === 'ADMIN' || upper === 'SUPERUSER' || upper === 'PHARMACY_ADMIN') return 'admin';
  return null;
}

export type ShiftSurfaceInput = {
  pathname?: string | null;
  role?: string | null;
  userId?: number | string | null;
  /** WorkspaceContext */
  workspace?: string | null;
  canUsePlatform?: boolean;
  selectedPharmacyId?: number | null;
  workspaceLoading?: boolean;
  /** AdminWorkspaceContext, present only inside the /admin shell */
  adminPharmacyId?: number | null;
  adminLoading?: boolean;
  /** orgCapabilities(user).roster: web's organization Shifts / Post shift guard */
  orgRoster?: boolean;
  /** useAuth().hasCapability */
  hasCapability?: (capability: string, pharmacyId?: number | null) => boolean;
};

export type ShiftSurface = {
  persona: ShiftPersona | null;
  /** Pharmacy the poster screens show (null = all). Display filter only; the server scopes every list. */
  scopedPharmacyId: number | null;
  /** Worker board: 'internal' (Community) or 'platform' (Public). Null for posters. */
  workspace: ShiftWorkspace | null;
  /** Explorer: platform shifts only, never the internal workspace. */
  publicOnly: boolean;
  /** Post, edit and run the Shift Centre (owner; org manage_roster; admin MANAGE_ROSTER on the active pharmacy). */
  canManageShifts: boolean;
  /** Manage the pharmacy's admins (owner; MANAGE_ADMINS on the scoped pharmacy). */
  canManageAdmins: boolean;
  /** False while the workspace or admin assignment is still loading; wait instead of showing "no access". */
  ready: boolean;
  /** persona:workspace:pharmacyId:userId. Key requests and stored state by it so an old scope never writes. */
  scopeKey: string;
};

/** One policy for every shift screen: who is looking, at which pharmacy or workspace, and what they may do. */
export function resolveShiftSurface(input: ShiftSurfaceInput): ShiftSurface {
  const persona = shiftPersonaFromPath(input.pathname) ?? shiftPersonaFromRole(input.role);
  const can = (capability: string, pharmacyId: number | null) =>
    Boolean(pharmacyId && input.hasCapability?.(capability, pharmacyId));
  let scopedPharmacyId: number | null = null;
  let workspace: ShiftWorkspace | null = null;
  let canManageShifts = false;
  let canManageAdmins = false;

  if (persona === 'owner') {
    scopedPharmacyId = input.selectedPharmacyId ?? null;
    canManageShifts = true;
    canManageAdmins = true; // web PharmacyAdmins: owners manage their own pharmacies' admins
  } else if (persona === 'organization') {
    scopedPharmacyId = input.selectedPharmacyId ?? null;
    canManageShifts = Boolean(input.orgRoster);
    canManageAdmins = can('MANAGE_ADMINS', scopedPharmacyId);
  } else if (persona === 'admin') {
    // The admin assignment, not WorkspaceContext: AdminWorkspaceProvider copies it there a beat later.
    scopedPharmacyId = input.adminPharmacyId ?? null;
    canManageShifts = can('MANAGE_ROSTER', scopedPharmacyId);
    canManageAdmins = can('MANAGE_ADMINS', scopedPharmacyId);
  } else if (persona === 'explorer') {
    workspace = 'platform';
  } else if (persona) {
    workspace = input.workspace === 'platform' && input.canUsePlatform ? 'platform' : 'internal';
  }

  const ready = !input.workspaceLoading && !(persona === 'admin' && input.adminLoading);
  // Internal worker boards request the selected pharmacy's shifts, so each pharmacy gets its own key.
  const keyPharmacyId = workspace === 'internal' ? input.selectedPharmacyId ?? null : scopedPharmacyId;
  return {
    persona,
    scopedPharmacyId,
    workspace,
    publicOnly: persona === 'explorer',
    canManageShifts,
    canManageAdmins,
    ready,
    scopeKey: [persona ?? 'none', workspace ?? 'all', keyPharmacyId ?? 'all', input.userId ?? 'anon'].join(':'),
  };
}

/** Tab labels for each section (web nav wording, shortened for a phone). */
export const SHIFT_SECTION_LABELS: Record<ShiftSection, string> = {
  public: 'Public',
  community: 'Community',
  active: 'Active',
  confirmed: 'Confirmed',
  history: 'History',
  roster: 'Roster',
};

/**
 * The Shifts screen sections in tab order, from web: posters get the Shift Centre; pharmacists and other staff
 * get Community (internal) or Public (platform) with Confirmed and History; Explorer gets its four routes.
 */
export function shiftSections(surface: Pick<ShiftSurface, 'persona' | 'workspace'>): ShiftSection[] {
  const { persona } = surface;
  if (!persona) return [];
  if (!isWorkerPersona(persona)) return ['active', 'confirmed', 'history'];
  if (persona === 'explorer') return ['public', 'community', 'confirmed', 'history'];
  return [surface.workspace === 'platform' ? 'public' : 'community', 'confirmed', 'history'];
}

/** The requested section when this surface has it, else the first: a stale ?section= never blanks the screen. */
export function pickShiftSection(sections: readonly ShiftSection[], requested?: string | null): ShiftSection | null {
  const wanted = String(requested ?? '').toLowerCase() as ShiftSection;
  return sections.includes(wanted) ? wanted : sections[0] ?? null;
}

export type ShiftLink = {
  /** The persona named in the web URL (/dashboard/admin/:pharmacyId/... = 'admin'). */
  persona: ShiftPersona;
  section: ShiftSection | null;
  shiftId: number | null;
  /** The URL's query and fragment, verbatim. */
  suffix: string;
};

const SHIFT_LINK =
  /^(?:https?:\/\/[^/?#]+)?\/dashboard\/(admin\/[^/?#]+|owner|organization|pharmacist|otherstaff|explorer)\/(?:shifts|shift-center)(?:\/([^/?#]+))?(?:\/([^/?#]+))?\/?([?#].*)?$/i;
const isId = (value?: string) => value != null && /^\d+$/.test(value);

/** Parses a web shift link (/dashboard/:persona/shifts[/section][/id], shift-center, admin/:pharmacyId); null otherwise. */
export function parseShiftLink(url?: string | null): ShiftLink | null {
  const match = SHIFT_LINK.exec(String(url ?? '').trim());
  if (!match) return null;
  const [, who, first, second, suffix = ''] = match;
  const persona = (who.toLowerCase().startsWith('admin/') ? 'admin' : who.toLowerCase()) as ShiftPersona;
  if (first == null) return { persona, section: null, shiftId: null, suffix };
  if (isId(first)) return second == null ? { persona, section: null, shiftId: Number(first), suffix } : null;
  const section = first.toLowerCase() as ShiftSection;
  if (!SHIFT_SECTIONS.includes(section) || (second != null && !isId(second))) return null;
  return { persona, section, shiftId: second != null ? Number(second) : null, suffix };
}

function withParam(suffix: string, key: string, value: string) {
  const hashAt = suffix.indexOf('#');
  const query = hashAt < 0 ? suffix : suffix.slice(0, hashAt);
  const hash = hashAt < 0 ? '' : suffix.slice(hashAt);
  if (new RegExp(`[?&]${key}=`).test(query)) return suffix;
  const pair = `${key}=${encodeURIComponent(value)}`;
  return `${query.length > 1 ? `${query}&` : '?'}${pair}${hash}`;
}

/**
 * The mobile route for a shift link in `persona`'s shell: detail (/shifts/:id), a section (/shifts?section=),
 * a worker's roster (/my-roster) or the board itself. The link's query and fragment are kept.
 */
export function shiftRoute(persona: ShiftPersona, link: Partial<Pick<ShiftLink, 'section' | 'shiftId' | 'suffix'>>): string {
  const suffix = link.suffix ?? '';
  const base = `/${persona}/shifts`;
  if (link.shiftId != null) return `${base}/${link.shiftId}${suffix}`;
  if (link.section === 'roster') return persona === 'pharmacist' || persona === 'otherstaff' ? `/my-roster${suffix}` : `${base}${suffix}`;
  return link.section ? `${base}${withParam(suffix, 'section', link.section)}` : `${base}${suffix}`;
}
