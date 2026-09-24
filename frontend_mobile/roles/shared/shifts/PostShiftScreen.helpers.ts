export const ROLE_OPTIONS = ['PHARMACIST', 'TECHNICIAN', 'ASSISTANT', 'INTERN', 'STUDENT'];
export const EMPLOYMENT_TYPES = ['LOCUM', 'PART_TIME', 'FULL_TIME'];
export const WORKLOAD_TAGS = ['Sole Pharmacist', 'High Script Load', 'Webster Packs'];
export const PRIMARY = '#5222B8';
export const PRIMARY_LIGHT = '#F0EAFF';
export const PRIMARY_TEXT = '#3B1A83';

export type StepKey = 'details' | 'skills' | 'visibility' | 'timetable' | 'payrate';
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
    FIXED: 'The rate is fixed in advance and is not negotiable.',
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

const readPharmacyValue = (pharmacy: any, snake: string, camel?: string) =>
    pharmacy?.[snake] ?? (camel ? pharmacy?.[camel] : undefined);

const normalizeHour = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    return value ? value.slice(0, 5) : '';
};

const toCamelHoursKey = (prefix: string, suffix: 'start' | 'end' | 'closed') =>
    `${prefix}_${suffix}`.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

const pharmacyPublicHolidayDates = (pharmacy: any): string[] => {
    const raw =
        pharmacy?.public_holiday_dates ??
        pharmacy?.publicHolidayDates ??
        pharmacy?.public_holidays_dates ??
        pharmacy?.publicHolidaysDates ??
        pharmacy?.public_holidays ??
        pharmacy?.publicHolidays;
    if (!Array.isArray(raw)) return [];
    return raw
        .map((value) => (typeof value === 'string' ? value.slice(0, 10) : ''))
        .filter(Boolean);
};

const isPublicHolidayDate = (date: string, pharmacy: any) =>
    pharmacyPublicHolidayDates(pharmacy).includes(date);

export const pharmacyHoursForDate = (
    pharmacy: PharmacyOption | undefined,
    date: string,
    fallback: SlotTime,
): PharmacyHoursForDate => {
    if (!pharmacy || !date) {
        return { ...fallback, closed: false, label: 'selected day', isPublicHoliday: false };
    }

    const parsed = new Date(`${date}T00:00:00`);
    const weekday = Number.isNaN(parsed.getTime()) ? -1 : parsed.getDay();
    const isPublicHoliday = isPublicHolidayDate(date, pharmacy);
    const prefix = isPublicHoliday
        ? 'public_holidays'
        : weekday === 0
            ? 'sundays'
            : weekday === 6
                ? 'saturdays'
                : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'][weekday - 1] || '';
    const label = isPublicHoliday
        ? 'public holiday'
        : weekday === 0
            ? 'Sunday'
            : weekday === 6
                ? 'Saturday'
                : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][weekday - 1] || 'selected day';

    if (!prefix) {
        return { ...fallback, closed: false, label, isPublicHoliday };
    }

    const start = normalizeHour(
        readPharmacyValue(pharmacy, `${prefix}_start`, toCamelHoursKey(prefix, 'start')),
    );
    const end = normalizeHour(
        readPharmacyValue(pharmacy, `${prefix}_end`, toCamelHoursKey(prefix, 'end')),
    );
    const closed = Boolean(
        readPharmacyValue(pharmacy, `${prefix}_closed`, toCamelHoursKey(prefix, 'closed')),
    );

    return {
        startTime: start || fallback.startTime,
        endTime: end || fallback.endTime,
        closed,
        label,
        isPublicHoliday,
    };
};

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
