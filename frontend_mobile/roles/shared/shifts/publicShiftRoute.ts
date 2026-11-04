import { resolvePersonaSelection, type Shift } from '@chemisttasker/shared-core';
import { shiftPersonaFromRole, shiftRoute, type ShiftPersona } from './shiftSurface';
import {
  getAssignmentPharmacyId,
  getSelectedAdminAssignment,
  readPersonaSelection,
} from '@/utils/mobilePersona';

export type RouteDecision = { type: 'allow' } | { type: 'redirect'; path: string };
export type RouteDecisionInput = {
  user: { role?: string | null; is_mobile_verified?: boolean; mobile_check_skipped?: boolean } | null | undefined;
  segments: readonly string[];
  ahpra?: { frozen?: boolean; refusal?: boolean; state?: string } | null;
  ownerNextPath?: string | null;
};

export const PUBLIC_AUTH_ROUTES = new Set([
  'login',
  'register',
  'welcome',
  'verify-otp',
  'forgot-password',
  'reset-password',
  'mobile-verify',
  'index',
  'contact',
]);

export const PUBLIC_SHIFT_ALLOWLIST = new Set(['shifts/link', 'shifts/public-board']);

export function isPublicShiftRoute(segments: readonly string[]): boolean {
  if (segments.length !== 2) return false;
  return PUBLIC_SHIFT_ALLOWLIST.has(`${segments[0]}/${segments[1]}`);
}

export function getPersonaDashboard(role?: string | null): string {
  const normalized = String(role || '').toUpperCase();
  if (normalized === 'OWNER') return '/owner/dashboard';
  if (['ORGANIZATION', 'ORG_ADMIN', 'ORG_OWNER', 'ORG_STAFF', 'CHIEF_ADMIN', 'REGION_ADMIN'].includes(normalized)) {
    return '/organization/dashboard';
  }
  if (['PHARMACY_MANAGER', 'PHARMACY_ADMIN', 'ADMIN'].includes(normalized)) {
    return '/admin/shifts';
  }
  if (normalized === 'PHARMACIST') return '/pharmacist/dashboard';
  if (normalized === 'OTHER_STAFF') return '/otherstaff/dashboard';
  if (normalized === 'EXPLORER') return '/explorer/dashboard';
  return '/login';
}

export function evaluateRouteDecision(input: RouteDecisionInput): RouteDecision {
  const top = input.segments[0];
  const currentPath = `/${input.segments.join('/')}`;
  const isShiftPublic = isPublicShiftRoute(input.segments);
  const isGeneralPublic = PUBLIC_AUTH_ROUTES.has(top ?? '');

  if (!input.user) {
    return isShiftPublic || isGeneralPublic || top === undefined
      ? { type: 'allow' }
      : { type: 'redirect', path: '/login' };
  }

  const normalizedRole = String(input.user.role || '').toUpperCase();
  const isOwner = normalizedRole === 'OWNER';
  const ahpraBlocked = !isOwner && input.ahpra?.state !== 'review' && (input.ahpra?.frozen || input.ahpra?.refusal);
  if (ahpraBlocked) {
    const ahpraPath = normalizedRole === 'PHARMACIST' ? '/pharmacist/profile-basic-info' : '/otherstaff/profile-regulatory';
    const isInvite = ['/pharmacist/memberships', '/otherstaff/memberships', '/admin-invitations'].includes(currentPath);
    return currentPath !== ahpraPath && !isInvite ? { type: 'redirect', path: ahpraPath } : { type: 'allow' };
  }

  if (!input.user.is_mobile_verified && !input.user.mobile_check_skipped) {
    return top !== 'mobile-verify' ? { type: 'redirect', path: '/mobile-verify' } : { type: 'allow' };
  }

  if (isOwner && input.ownerNextPath) {
    return currentPath !== input.ownerNextPath ? { type: 'redirect', path: input.ownerNextPath } : { type: 'allow' };
  }

  if (isShiftPublic) return { type: 'allow' };

  if (top === 'shifts') {
    return { type: 'redirect', path: getPersonaDashboard(input.user.role) };
  }

  if (isGeneralPublic) {
    return { type: 'redirect', path: getPersonaDashboard(input.user.role) };
  }

  return { type: 'allow' };
}

export function resolvePostAuthShiftRoute(
  role: string | null | undefined,
  shiftId: number | string,
  options?: {
    persona?: ShiftPersona | null;
    adminCan?: ((capability: string) => boolean) | null;
  },
): string {
  const upper = String(role || '').toUpperCase();
  const target =
    (options?.persona === 'admin' && options.adminCan?.('MANAGE_ROSTER') ? 'admin' : null) ??
    (options?.persona && options.persona !== 'admin' ? options.persona : null) ??
    (upper === 'PHARMACY_MANAGER' || upper === 'PHARMACY_ADMIN' || upper === 'ADMIN' || upper === 'SUPERUSER' ? 'admin' : null) ??
    shiftPersonaFromRole(role) ??
    'pharmacist';
  return shiftRoute(target, { shiftId: Number(shiftId) });
}

export async function resolveActiveShiftPersona(user: any): Promise<ShiftPersona | null> {
  if (!user) return null;
  try {
    const stored = await readPersonaSelection(user);
    const selection = resolvePersonaSelection(user, stored);
    if (selection.mode === 'admin') return 'admin';
  } catch {
    // Fall back to account role persona if storage or selection resolution fails
  }
  return shiftPersonaFromRole(user.role);
}

export interface ResolveShiftHandoffOptions {
  user: any;
  shiftId: number | string;
  isHydrated: boolean;
  selectedPharmacyId?: number | null;
  hasCapability?: (capability: string, pharmacyId?: number | null) => boolean;
  resolvePersona?: (user: any) => Promise<ShiftPersona | null> | ShiftPersona | null;
  resolveAdminAssignment?: (user: any) => Promise<any> | any;
}

export async function resolvePublicShiftHandoffRoute(
  options: ResolveShiftHandoffOptions,
): Promise<string | null> {
  if (!options.isHydrated || !options.user) {
    return null;
  }

  const resolvePersona = options.resolvePersona ?? resolveActiveShiftPersona;
  const persona = await resolvePersona(options.user);

  let adminPharmacyId: number | null = null;
  const resolveAssignment = options.resolveAdminAssignment ?? getSelectedAdminAssignment;
  const adminAssignment = await resolveAssignment(options.user);
  if (adminAssignment) {
    adminPharmacyId = getAssignmentPharmacyId(adminAssignment);
  }
  if (adminPharmacyId == null && typeof options.selectedPharmacyId === 'number') {
    adminPharmacyId = options.selectedPharmacyId;
  }

  const adminCan = (capability: string) =>
    Boolean(adminPharmacyId && options.hasCapability?.(capability, adminPharmacyId));

  return resolvePostAuthShiftRoute(options.user.role, options.shiftId, { persona, adminCan });
}

export function buildReferralAuthParams(params: {
  referral_code?: string | null;
  referral_event_id?: string | null;
  referral_shift_id?: string | null;
  role?: string | null;
}): Record<string, string> {
  const query: Record<string, string> = {};
  if (params.referral_code) query.referral_code = params.referral_code;
  if (params.referral_event_id) query.referral_event_id = params.referral_event_id;
  if (params.referral_shift_id) query.referral_shift_id = params.referral_shift_id;
  if (params.role) query.role = params.role;
  return query;
}

export function mapPublicShift(raw: any): Shift {
  if (!raw) return {} as Shift;
  const pharmacy = raw.pharmacy_detail || raw.pharmacyDetail || {};
  const slots = (raw.slots || []).map((s: any) => ({
    ...s,
    id: s.id,
    date: s.date ?? s.slot_date ?? s.slotDate,
    startTime: s.start_time ?? s.startTime ?? '',
    endTime: s.end_time ?? s.endTime ?? '',
    startHour: s.start_hour ?? s.startHour,
    rate: s.rate,
  }));
  return {
    ...raw,
    roleLabel: raw.role_label ?? raw.roleLabel ?? raw.role_needed ?? raw.roleNeeded,
    roleNeeded: raw.role_needed ?? raw.roleNeeded,
    canApply: raw.can_apply ?? raw.canApply,
    employmentType: raw.employment_type ?? raw.employmentType,
    rateType: raw.rate_type ?? raw.rateType,
    minHourlyRate: raw.min_hourly_rate ?? raw.minHourlyRate,
    maxHourlyRate: raw.max_hourly_rate ?? raw.maxHourlyRate,
    minAnnualSalary: raw.min_annual_salary ?? raw.minAnnualSalary,
    maxAnnualSalary: raw.max_annual_salary ?? raw.maxAnnualSalary,
    fixedRate: raw.fixed_rate ?? raw.fixedRate,
    superPercent: raw.super_percent ?? raw.superPercent,
    paymentPreference: raw.payment_preference ?? raw.paymentPreference,
    postAnonymously: raw.post_anonymously ?? raw.postAnonymously,
    slots,
    flexibleTiming: raw.flexible_timing ?? raw.flexibleTiming,
    singleUserOnly: raw.single_user_only ?? raw.singleUserOnly,
    workloadTags: raw.workload_tags ?? raw.workloadTags ?? [],
    mustHave: raw.must_have ?? raw.mustHave ?? [],
    niceToHave: raw.nice_to_have ?? raw.niceToHave ?? [],
    hasTravel: raw.has_travel ?? raw.hasTravel ?? false,
    hasAccommodation: raw.has_accommodation ?? raw.hasAccommodation ?? false,
    isUrgent: raw.is_urgent ?? raw.isUrgent ?? false,
    uiIsNegotiable: raw.ui_is_negotiable ?? raw.uiIsNegotiable,
    uiIsFlexibleTime: raw.ui_is_flexible_time ?? raw.uiIsFlexibleTime,
    uiAllowPartial: raw.ui_allow_partial ?? raw.uiAllowPartial,
    uiLocationCity: raw.ui_location_city ?? raw.uiLocationCity ?? pharmacy.suburb,
    uiLocationState: raw.ui_location_state ?? raw.uiLocationState ?? pharmacy.state,
    uiAddressLine:
      raw.ui_address_line ??
      raw.uiAddressLine ??
      [pharmacy.street_address ?? pharmacy.streetAddress, pharmacy.suburb, pharmacy.state, pharmacy.postcode]
        .filter(Boolean)
        .join(', '),
    uiDistanceKm: raw.ui_distance_km ?? raw.uiDistanceKm,
    uiIsUrgent: raw.ui_is_urgent ?? raw.uiIsUrgent ?? raw.is_urgent ?? raw.isUrgent,
    pharmacyDetail: {
      name: pharmacy.name,
      streetAddress: pharmacy.street_address ?? pharmacy.streetAddress,
      suburb: pharmacy.suburb,
      state: pharmacy.state,
      postcode: pharmacy.postcode,
    },
    createdAt: raw.created_at ?? raw.createdAt,
    isClosed: raw.is_closed ?? raw.isClosed,
    closedReason: raw.closed_reason ?? raw.closedReason,
  } as Shift;
}
