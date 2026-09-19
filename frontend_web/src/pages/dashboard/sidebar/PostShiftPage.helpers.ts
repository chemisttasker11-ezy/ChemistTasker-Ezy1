import dayjs from 'dayjs';
import moment from 'moment';
import { momentLocalizer } from 'react-big-calendar';
import type { PharmacySummary } from '@chemisttasker/shared-core';
import { ORG_ROLES } from '../../../constants/roles';

export type PharmacyOption = PharmacySummary & { hasChain?: boolean; claimed?: boolean };

export type ShiftDescriptionTemplate = {
  id: number;
  pharmacy: number;
  role_needed: string;
  description: string;
};

export type SlotTime = { startTime: string; endTime: string };

export type PharmacyHoursForDate = SlotTime & {
  closed: boolean;
  label: string;
  isPublicHoliday: boolean;
};

export interface SlotEntry {
  date: string;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
  recurringDays: number[];
  recurringEndDate: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource?: {
    slotIndex: number;
    occurrenceIndex: number;
  };
}

export type CalendarViewOption = 'month' | 'week' | 'day';

export type PostShiftPrefill = {
  pharmacyId: string | null;
  roleNeeded: string | null;
  date: string | null;
  dates: string | null;
  startTime: string | null;
  endTime: string | null;
  visibility: string | null;
  employmentType: string | null;
  dedicatedUser: string | null;
  hasPrefill: boolean;
};

export const readPostShiftPrefill = (search: string): PostShiftPrefill => {
  const params = new URLSearchParams(search);
  const pharmacyId = params.get('pharmacy') ?? params.get('pharmacy_id');
  const roleNeeded = params.get('role') ?? params.get('role_needed');
  const date = params.get('date') ?? params.get('slot_date');
  const dates = params.get('dates') ?? params.get('slot_dates');
  const startTime = params.get('start_time') ?? params.get('start');
  const endTime = params.get('end_time') ?? params.get('end');
  const visibility = params.get('visibility');
  const employmentType = params.get('employment_type');
  const dedicatedUser = params.get('dedicated_user') ?? params.get('dedicated_user_id');
  const hasPrefill = Boolean(
    pharmacyId || roleNeeded || date || dates || startTime || endTime || visibility ||
      employmentType || dedicatedUser,
  );
  return {
    pharmacyId,
    roleNeeded,
    date,
    dates,
    startTime,
    endTime,
    visibility,
    employmentType,
    dedicatedUser,
    hasPrefill,
  };
};

export interface CalendarSlotSelection {
  start: Date;
  end: Date;
  slots: Date[];
  action?: 'select' | 'click' | 'doubleClick';
  bounds?: DOMRect | ClientRect;
  box?: DOMRect | ClientRect;
}

export const toRateInputString = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);

export const getSlotRateValue = (slot: any): unknown =>
  slot?.rate ?? slot?.rate_per_hour ?? slot?.ratePerHour ?? slot?.hourly_rate ?? slot?.hourlyRate;

export const firstPresent = (...values: unknown[]): unknown =>
  values.find((value) => value !== null && value !== undefined && value !== '');

export const CALENDAR_VIEWS: CalendarViewOption[] = ['month', 'week', 'day'];

export const GOVERNMENT_AWARD_GUIDE_URL =
  'https://calculate.fairwork.gov.au/payguides/fairwork/ma000012/pdf';

export const localizer = momentLocalizer(moment);

export const WEEK_DAYS = [
  { v: 1, l: 'M', full: 'Monday' },
  { v: 2, l: 'T', full: 'Tuesday' },
  { v: 3, l: 'W', full: 'Wednesday' },
  { v: 4, l: 'T', full: 'Thursday' },
  { v: 5, l: 'F', full: 'Friday' },
  { v: 6, l: 'S', full: 'Saturday' },
  { v: 0, l: 'S', full: 'Sunday' },
];

export const DAY_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const DEFAULT_SUPER_PERCENT = 11.5;

export const toIsoDate = (value: string): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = dayjs(trimmed);
  if (parsed.isValid()) {
    return parsed.startOf('day').toDate();
  }

  const datePortion = trimmed.split('T')[0];
  if (datePortion) {
    const [year, month, day] = datePortion.split('-').map((part) => Number.parseInt(part, 10));
    if ([year, month, day].every((part) => Number.isFinite(part))) {
      return new Date(year, month - 1, day);
    }
  }

  return null;
};

export const isValidDate = (date: Date | null | undefined): date is Date => {
  return Boolean(date && !Number.isNaN(date.getTime()));
};

export const applyTimeToDate = (date: Date, time: string) => {
  const [hour, minute] = time.split(':').map(Number);
  const next = new Date(date.getTime());
  next.setHours(hour, minute, 0, 0);
  return next;
};

export const formatSlotDate = (value: string) =>
  value ? dayjs(value).format('DD/MM/YYYY') : '';

export const formatSlotTime = (value: string) =>
  dayjs(`1970-01-01T${value}`).format('h:mm A');

export const getSlotDurationHours = (startTime?: string, endTime?: string) => {
  if (!startTime || !endTime) return 0;
  const start = dayjs(`1970-01-01T${startTime.slice(0, 5)}`);
  let end = dayjs(`1970-01-01T${endTime.slice(0, 5)}`);
  if (!start.isValid() || !end.isValid()) return 0;
  if (end.isBefore(start) || end.isSame(start)) end = end.add(1, 'day');
  return Math.max(0, end.diff(start, 'minute') / 60);
};

export const formatSlotDisplayDate = (value: string) => {
  if (!value) return '';
  const parsed = dayjs(value);
  if (!parsed.isValid()) return value;
  const day = parsed.date();
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
  return `${parsed.format('ddd')}, ${day}${suffix} of ${parsed.format('MMMM YYYY')}`;
};

export const RATE_TYPE_DESCRIPTIONS: Record<string, string> = {
  FLEXIBLE: 'The rate is flexible and negotiable with the candidate.',
  FIXED: 'The rate is fixed in advanceand  and not negotiable',
  PHARMACIST_PROVIDED: 'Use the candidate’s preset rate. You’ll always see it before assigning the shift.',
};

export const toInputDateTimeLocal = (value?: string | null) =>
  value ? dayjs(value).local().format('YYYY-MM-DDTHH:mm') : '';

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

export const describeRecurringDays = (days: number[]) => {
  if (!days?.length) return '';
  const ordered = [...days].sort((a, b) => ((a === 0 ? 7 : a) - (b === 0 ? 7 : b)));
  return ordered.map((day) => DAY_LABELS_SHORT[day]).join(' / ');
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

  const parsed = dayjs(date);
  const isPublicHoliday = isPublicHolidayDate(date, pharmacy);
  const weekday = parsed.isValid() ? parsed.day() : -1;
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

export const ORG_ROLE_VALUES = ORG_ROLES as readonly string[];
