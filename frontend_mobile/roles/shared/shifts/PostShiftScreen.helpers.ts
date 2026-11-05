import { getPharmacyHoursForDate } from '@chemisttasker/shared-core';
export const ROLE_OPTIONS = ['PHARMACIST', 'TECHNICIAN', 'ASSISTANT', 'INTERN', 'STUDENT'];
export const EMPLOYMENT_TYPES = ['LOCUM', 'PART_TIME', 'FULL_TIME'];
export const PRIMARY = '#4F46E5';
export const PRIMARY_LIGHT = '#EEF2FF';
export const PRIMARY_TEXT = '#312E81';

export type StepKey = 'details' | 'skills' | 'visibility' | 'timetable' | 'payrate' | 'review';
export type RateType = 'FLEXIBLE' | 'FIXED' | 'PHARMACIST_PROVIDED';
export type VisibilityTier = 'FULL_PART_TIME' | 'LOCUM_CASUAL' | 'OWNER_CHAIN' | 'ORG_CHAIN' | 'PLATFORM';
export type VisibilityDates = {
    locum_casual?: string;
    owner_chain?: string;
    org_chain?: string;
    platform?: string;
};

export const VISIBILITY_LABELS: Record<VisibilityTier, string> = {
    FULL_PART_TIME: 'Pharmacy Members',
    LOCUM_CASUAL: 'Favourite Staff',
    OWNER_CHAIN: 'Owner Chain',
    ORG_CHAIN: 'Organization',
    PLATFORM: 'Platform (Public)',
};

export const VISIBILITY_META: Record<
    VisibilityTier,
    { eyebrow: string; description: string; tint: string; border: string }
> = {
    FULL_PART_TIME: {
        eyebrow: 'Internal first',
        description: 'Start with your own pharmacy team before widening the audience.',
        tint: '#ECFDF5',
        border: '#A7F3D0',
    },
    LOCUM_CASUAL: {
        eyebrow: 'Trusted bench',
        description: 'Open the shift to your known locums and favourite casual staff.',
        tint: '#EFF6FF',
        border: '#BFDBFE',
    },
    OWNER_CHAIN: {
        eyebrow: 'Chain network',
        description: 'Share across the owner chain when local coverage is still unavailable.',
        tint: '#FFF7ED',
        border: '#FED7AA',
    },
    ORG_CHAIN: {
        eyebrow: 'Organization reach',
        description: 'Escalate to the wider organization to improve fill speed.',
        tint: '#FDF2F8',
        border: '#FBCFE8',
    },
    PLATFORM: {
        eyebrow: 'Public audience',
        description: 'Publish broadly on the platform for maximum visibility and reach.',
        tint: '#F5F3FF',
        border: '#DDD6FE',
    },
};

export const RATE_TYPE_DESCRIPTIONS: Record<RateType, string> = {
    FLEXIBLE: 'The rate is flexible and negotiable with the candidate.',
    FIXED: 'The rate is fixed in advance and not negotiable.',
    PHARMACIST_PROVIDED: 'Use the candidate’s preset rate. You’ll always see it before assigning the shift.',
};

export const GOVERNMENT_AWARD_GUIDE_URL =
    'https://calculate.fairwork.gov.au/payguides/fairwork/ma000012/pdf';

export const BASE_STEP_ORDER = ['details', 'skills', 'visibility'] as const;

export const toRateInputString = (value: unknown): string =>
    value === null || value === undefined ? '' : String(value);

export const getSlotRateValue = (slot: any): unknown =>
    slot?.rate ?? slot?.rate_per_hour ?? slot?.ratePerHour ?? slot?.hourly_rate ?? slot?.hourlyRate;

export const firstPresent = (...values: unknown[]): unknown =>
    values.find((value) => value !== null && value !== undefined && value !== '');

export type SlotEntry = {
    date: string;
    startTime: string;
    endTime: string;
    isRecurring: boolean;
    recurringDays: number[];
    recurringEndDate: string;
};

export type SlotTime = { startTime: string; endTime: string };

export type PharmacyHoursForDate = SlotTime & {
    closed: boolean;
    label: string;
    isPublicHoliday: boolean;
    holidayNeedsReview: boolean;
    holidayStatus: string;
    partDayWindows: import('@chemisttasker/shared-core').PharmacyHolidayWindow[];
};

export type PharmacyOption = {
    id: number;
    name?: string;
    has_chain?: boolean;
    hasChain?: boolean;
    claimed?: boolean;
    organization_id?: number;
    organizationId?: number;
    allowed_escalation_levels?: VisibilityTier[];
    allowedEscalationLevels?: VisibilityTier[];
};

export type ShiftDescriptionTemplate = {
    id: number;
    pharmacy: number;
    role_needed: string;
    description: string;
};

export const pharmacyHoursForDate = (
  pharmacy: PharmacyOption | undefined,
  date: string,
  fallback: SlotTime,
): PharmacyHoursForDate => getPharmacyHoursForDate(pharmacy, date, fallback);

export const toIsoDate = (value: string): Date | null => {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
};

export const toLocalIsoDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const formatAuDate = (value?: string) => {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
};

export const formatLongSlotDate = (value?: string) => {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    const day = date.getDate();
    const suffix =
        day >= 11 && day <= 13
            ? 'th'
            : day % 10 === 1
                ? 'st'
                : day % 10 === 2
                    ? 'nd'
                    : day % 10 === 3
                        ? 'rd'
                        : 'th';
    const weekday = date.toLocaleDateString('en-AU', { weekday: 'short' });
    const month = date.toLocaleDateString('en-AU', { month: 'long' });
    return `${weekday}, ${day}${suffix} of ${month} ${date.getFullYear()}`;
};

export const formatClockTime = (value?: string) => {
    if (!value) return '';
    const [hours, minutes] = value.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });
};

export const getSlotDurationHours = (startTime?: string, endTime?: string) => {
    if (!startTime || !endTime) return 0;
    const [startHour, startMinute] = startTime.slice(0, 5).split(':').map(Number);
    const [endHour, endMinute] = endTime.slice(0, 5).split(':').map(Number);
    if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return 0;
    const startTotal = startHour * 60 + startMinute;
    let endTotal = endHour * 60 + endMinute;
    if (endTotal <= startTotal) endTotal += 24 * 60;
    return Math.max(0, (endTotal - startTotal) / 60);
};

export const formatDateLabel = (value?: string) => {
    if (!value) return 'Choose a date';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return formatAuDate(value);
};

export const normalizePrefillRole = (value?: string | null) => {
    if (!value) return '';
    const normalized = value.trim().toUpperCase().replace(/\s+/g, '_');
    if (['PHARMACIST', 'TECHNICIAN', 'ASSISTANT', 'INTERN', 'STUDENT', 'EXPLORER'].includes(normalized)) {
        return normalized;
    }
    if (normalized.includes('OTHER_STAFF')) return 'ASSISTANT';
    if (normalized.includes('COMMUNITY_PHARMACIST')) return 'PHARMACIST';
    if (normalized.includes('DISPENSARY_TECHNICIAN')) return 'TECHNICIAN';
    if (normalized.includes('PHARMACY_TECHNICIAN')) return 'TECHNICIAN';
    if (normalized.includes('PHARMACY_ASSISTANT')) return 'ASSISTANT';
    if (normalized.includes('PHARMACIST')) return 'PHARMACIST';
    if (normalized.includes('TECHNICIAN')) return 'TECHNICIAN';
    if (normalized.includes('ASSISTANT')) return 'ASSISTANT';
    if (normalized.includes('INTERN')) return 'INTERN';
    if (normalized.includes('STUDENT')) return 'STUDENT';
    return '';
};


export type PostShiftRawParams = {
    edit?: string | string[];
    dates?: string | string[];
    date?: string | string[];
    role?: string | string[];
    role_needed?: string | string[];
    start_time?: string | string[];
    end_time?: string | string[];
    dedicated_user?: string | string[];
    embedded?: string | string[];
    pharmacyId?: string | string[];
    pharmacy_id?: string | string[];
};

export type ParsedPostShiftParams = {
    editingId: number | null;
    routePharmacyId: number | null;
    dates: string[];
    roleNeeded: string;
    startTime: string;
    endTime: string;
    hasStartTime: boolean;
    hasEndTime: boolean;
    dedicatedUserId: number | null;
    isEmbedded: boolean;
};

const firstParam = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && value.length > 0 && value[0] != null) return String(value[0]);
    return '';
};

export const toPositiveInt = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const raw = typeof value === 'string' || typeof value === 'number' ? Number(value) : Number(firstParam(value));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
};

export function parsePostShiftSearchParams(
    params?: PostShiftRawParams | null,
    defaults?: { startTime?: string; endTime?: string },
): ParsedPostShiftParams {
    const editingId = toPositiveInt(params?.edit);
    const routePharmacyId = toPositiveInt(params?.pharmacyId) ?? toPositiveInt(params?.pharmacy_id);

    const rawDates = params?.dates;
    let parsedDates: string[] = [];
    if (typeof rawDates === 'string') {
        parsedDates = rawDates.split(',').map((d) => d.trim()).filter(Boolean);
    } else if (Array.isArray(rawDates)) {
        parsedDates = rawDates
            .reduce<string[]>((acc, val) => [...acc, ...String(val ?? '').split(',')], [])
            .map((d) => d.trim())
            .filter(Boolean);
    }
    const singleDate = firstParam(params?.date).trim();
    const dates = Array.from(new Set(parsedDates.length > 0 ? parsedDates : singleDate ? [singleDate] : [])).sort();

    const roleNeeded =
        normalizePrefillRole(firstParam(params?.role_needed)) ||
        normalizePrefillRole(firstParam(params?.role));

    const rawStart = firstParam(params?.start_time).trim().slice(0, 5);
    const rawEnd = firstParam(params?.end_time).trim().slice(0, 5);
    const hasStartTime = /^\d{2}:\d{2}$/.test(rawStart);
    const hasEndTime = /^\d{2}:\d{2}$/.test(rawEnd);

    return {
        editingId,
        routePharmacyId,
        dates,
        roleNeeded,
        startTime: hasStartTime ? rawStart : (defaults?.startTime ?? '09:00'),
        endTime: hasEndTime ? rawEnd : (defaults?.endTime ?? '17:00'),
        hasStartTime,
        hasEndTime,
        dedicatedUserId: toPositiveInt(params?.dedicated_user),
        isEmbedded: firstParam(params?.embedded) === '1',
    };
}

export function pickScopedPharmacyId(input: {
    routePharmacyId?: number | string | null;
    scopedPharmacyId?: number | string | null;
    currentPharmacyId?: number | string | null;
    pharmacies?: ReadonlyArray<{ id: number | string }>;
    preserveCurrent?: boolean;
}): number | '' {
    const list = input.pharmacies;
    if (list && list.length === 0) return '';
    const isAllowed = (id: number | null): id is number =>
        id != null && (!list || list.some((item) => Number(item.id) === id));

    const routeId = toPositiveInt(input.routePharmacyId);
    const scopedId = toPositiveInt(input.scopedPharmacyId);
    const currentId = toPositiveInt(input.currentPharmacyId);
    const ordered = input.preserveCurrent
        ? [currentId, routeId, scopedId]
        : [routeId, scopedId, currentId];

    for (const candidate of ordered) {
        if (isAllowed(candidate)) return candidate;
    }
    if (list && list.length > 0) {
        return toPositiveInt(list[0]?.id) ?? '';
    }
    return '';
}

export function canAccessPostShift(
    surface: { persona: string | null; canManageShifts: boolean; ready: boolean },
    routePharmacyId?: number | null,
    hasCapability?: (capability: string, pharmacyId?: number | null) => boolean,
): boolean {
    if (!surface.ready) return true;
    if (surface.canManageShifts) return true;
    if (surface.persona === 'admin' && routePharmacyId != null && hasCapability?.('MANAGE_ROSTER', routePharmacyId)) {
        return true;
    }
    return false;
}

export type PostShiftInitScope = {
    editingId: number | null;
    routePharmacyId: number | null;
    scopedPharmacyId: number | string | null;
};

export function shouldTriggerPostShiftInit(
    prev: PostShiftInitScope | null,
    next: PostShiftInitScope,
    isRetry?: boolean,
): boolean {
    if (!prev || isRetry) return true;
    return (
        prev.editingId !== next.editingId ||
        prev.routePharmacyId !== next.routePharmacyId ||
        prev.scopedPharmacyId !== next.scopedPharmacyId
    );
}

export type PostShiftFormResetOptions = {
    preservePrefills?: boolean;
    times?: { startTime?: string; endTime?: string };
};

export type ResetFormPrefillState = {
    roleNeeded: string;
    dedicatedUserId: number | null;
    dates: string[];
    slotDate: string;
    slots: SlotEntry[];
    selectedDates: string[];
    selectedDateTimes: Record<string, { startTime: string; endTime: string }>;
    slotStart: string;
    slotEnd: string;
};

export function computeResetFormPrefills(
    parsedParams?: ParsedPostShiftParams | null,
    options?: PostShiftFormResetOptions,
    currentTimes?: { startTime?: string; endTime?: string },
): ResetFormPrefillState {
    const todayIso = toLocalIsoDate(new Date());
    const timesToUse = options?.times ?? currentTimes;
    const preserve = Boolean(options?.preservePrefills);
    if (!preserve || !parsedParams) {
        return {
            roleNeeded: 'PHARMACIST',
            dedicatedUserId: null,
            dates: [],
            slotDate: todayIso,
            slots: [],
            selectedDates: [],
            selectedDateTimes: {},
            slotStart: timesToUse?.startTime || '09:00',
            slotEnd: timesToUse?.endTime || '17:00',
        };
    }

    const roleNeeded = parsedParams.roleNeeded || 'PHARMACIST';
    const dedicatedUserId = parsedParams.dedicatedUserId ?? null;
    const dates = Array.isArray(parsedParams.dates) ? parsedParams.dates : [];
    const startTime = parsedParams.hasStartTime
        ? parsedParams.startTime
        : (timesToUse?.startTime || '09:00');
    const endTime = parsedParams.hasEndTime
        ? parsedParams.endTime
        : (timesToUse?.endTime || '17:00');
    const slotDate = dates.length > 0 ? dates[0] : todayIso;
    const slots: SlotEntry[] = dates.map((date) => ({
        date,
        startTime,
        endTime,
        isRecurring: false,
        recurringDays: [],
        recurringEndDate: '',
    }));
    const selectedDateTimes = dates.reduce<Record<string, { startTime: string; endTime: string }>>(
        (acc, date) => {
            acc[date] = { startTime, endTime };
            return acc;
        },
        {},
    );

    return {
        roleNeeded,
        dedicatedUserId,
        dates,
        slotDate,
        slots,
        selectedDates: dates,
        selectedDateTimes,
        slotStart: startTime,
        slotEnd: endTime,
    };
}

export type AppliedPrefills = {
    datesKey?: string;
    timesKey?: string;
    roleKey?: string;
    dedicatedUserKey?: string;
};

export type PrefillPlan = {
    applyDates: boolean;
    applyTimes: boolean;
    applyRole: boolean;
    applyDedicatedUser: boolean;
    nextApplied: AppliedPrefills;
};

export function getStablePostShiftParamsKey(params?: PostShiftRawParams | null): string {
    if (!params) return '';
    return [
        firstParam(params.edit),
        firstParam(params.pharmacyId ?? params.pharmacy_id),
        Array.isArray(params.dates) ? params.dates.join(',') : firstParam(params.dates),
        firstParam(params.date),
        firstParam(params.role_needed ?? params.role),
        firstParam(params.start_time),
        firstParam(params.end_time),
        firstParam(params.dedicated_user),
        firstParam(params.embedded),
    ].join('|');
}

export function computePrefillPlan(
    applied: AppliedPrefills,
    parsed: ParsedPostShiftParams,
    isEditing: boolean,
): PrefillPlan {
    if (isEditing) {
        return {
            applyDates: false,
            applyTimes: false,
            applyRole: false,
            applyDedicatedUser: false,
            nextApplied: applied,
        };
    }
    const datesKey = parsed.dates.length > 0 ? parsed.dates.join(',') : '';
    const applyDates = Boolean(datesKey) && applied.datesKey !== datesKey;

    const timesKey = (parsed.hasStartTime || parsed.hasEndTime) ? (parsed.startTime + '-' + parsed.endTime) : '';
    const applyTimes = Boolean(timesKey) && applied.timesKey !== timesKey;

    const roleKey = parsed.roleNeeded || '';
    const applyRole = Boolean(roleKey) && applied.roleKey !== roleKey;

    const dedicatedUserKey = parsed.dedicatedUserId != null ? String(parsed.dedicatedUserId) : '';
    const applyDedicatedUser = Boolean(dedicatedUserKey) && applied.dedicatedUserKey !== dedicatedUserKey;

    return {
        applyDates,
        applyTimes,
        applyRole,
        applyDedicatedUser,
        nextApplied: {
            datesKey: datesKey || applied.datesKey,
            timesKey: timesKey || applied.timesKey,
            roleKey: roleKey || applied.roleKey,
            dedicatedUserKey: dedicatedUserKey || applied.dedicatedUserKey,
        },
    };
}

export type InitChainResult<TPharmacy = any, TShift = any> =
    | { status: 'aborted' }
    | { status: 'pharmacies_failed'; error: unknown }
    | { status: 'pharmacies_loaded'; pharmacies: TPharmacy }
    | { status: 'shift_failed'; pharmacies: TPharmacy; error: unknown }
    | { status: 'success'; pharmacies: TPharmacy; shift: TShift };

export async function runPostShiftInitChain<TPharmacy = any, TShift = any>(options: {
    isCurrent: () => boolean;
    loadPharmacies: () => Promise<TPharmacy>;
    loadShift?: () => Promise<TShift>;
    shouldLoadShift: boolean;
}): Promise<InitChainResult<TPharmacy, TShift>> {
    if (!options.isCurrent()) return { status: 'aborted' };

    let pharmacies: TPharmacy;
    try {
        pharmacies = await options.loadPharmacies();
    } catch (error) {
        if (!options.isCurrent()) return { status: 'aborted' };
        return { status: 'pharmacies_failed', error };
    }

    if (!options.isCurrent()) return { status: 'aborted' };

    if (!options.shouldLoadShift || !options.loadShift) {
        return { status: 'pharmacies_loaded', pharmacies };
    }

    let shift: TShift;
    try {
        shift = await options.loadShift();
    } catch (error) {
        if (!options.isCurrent()) return { status: 'aborted' };
        return { status: 'shift_failed', pharmacies, error };
    }

    if (!options.isCurrent()) return { status: 'aborted' };
    return { status: 'success', pharmacies, shift };
}
