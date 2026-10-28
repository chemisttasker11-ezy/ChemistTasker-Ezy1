/**
 * Client-side presentation of server-supplied public-holiday declarations.
 *
 * Do NOT implement award, council, gazette, or date calculations here.
 * The Django shifts.holidays domain alone resolves official geography.
 * This helper only formats authoritative pharmacy API response fields,
 * retaining both part-day windows and explicit verification uncertainty.
 */
export interface PharmacyHolidayWindow {
  date: string;
  start: string;
  end: string;
  name?: string;
  scope?: string;
  source?: string;
}

export interface PharmacyHolidayInfo {
  fullDay: boolean;
  partDayWindows: PharmacyHolidayWindow[];
  requiresReview: boolean;
  status: string;
}

type UnknownPharmacy = Record<string, unknown>;

const asRecord = (source: unknown): UnknownPharmacy =>
  source && typeof source === 'object' && !Array.isArray(source)
    ? source as UnknownPharmacy : {};

const asArray = (source: unknown): unknown[] => Array.isArray(source) ? source : [];

const isWindow = (item: unknown): item is PharmacyHolidayWindow => {
  const window = asRecord(item);
  return typeof window.date === 'string' &&
    typeof window.start === 'string' && typeof window.end === 'string';
};

export function getPharmacyHolidayInfo(
  date: string,
  pharmacy: unknown,
): PharmacyHolidayInfo {
  const record = asRecord(pharmacy);
  const dates = asArray(
    record.public_holiday_dates ?? record.publicHolidayDates ??
    record.public_holidays_dates ?? record.publicHolidaysDates ??
    record.public_holidays ?? record.publicHolidays,
  );
  const fullDay = dates.some(value =>
    typeof value === 'string' && value.slice(0, 10) === date
  );
  const partDayWindows = asArray(
    record.public_holiday_windows ?? record.publicHolidayWindows,
  ).filter(isWindow).filter(window =>
    window.date === date &&
    !(window.start === '00:00' && window.end === '24:00')
  );
  const calendar = asRecord(
    record.public_holiday_calendar_status ?? record.publicHolidayCalendarStatus,
  );
  const status = typeof calendar.status === 'string'
    ? calendar.status : 'REGION_NOT_CONFIGURED';
  const year = Number(date.slice(0, 4));
  const pendingYears = asArray(calendar.pendingYears ?? calendar.pending_years);
  // Region metadata is issued for the full 2026–2027 calendar. A local
  // region pending only 2027 is still verified for its published 2026 days.
  const isYearPending = pendingYears.some(value => Number(value) === year);
  const requiresReview = status === 'LOCAL_DECLARATION_PENDING'
    ? isYearPending
    : status !== 'VERIFIED' || isYearPending;
  const dateStatus = status === 'LOCAL_DECLARATION_PENDING' && !isYearPending
    ? 'VERIFIED'
    : status;
  return { fullDay, partDayWindows, requiresReview, status: dateStatus };
}

export interface PharmacyHours {
  startTime: string;
  endTime: string;
  closed: boolean;
  label: string;
  isPublicHoliday: boolean;
  holidayNeedsReview: boolean;
  holidayStatus: string;
  partDayWindows: PharmacyHolidayWindow[];
}

const normalizeHour = (value: unknown): string =>
  typeof value === 'string' ? value.slice(0, 5) : '';

const readDayValue = (
  record: Record<string, unknown>, prefix: string,
  suffix: 'start' | 'end' | 'closed',
): unknown => {
  const snake = `${prefix}_${suffix}`;
  const camel = snake.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  return record[snake] ?? record[camel];
};

/**
 * Identical pharmacy-hours/holiday presentation for Vite, Next and Expo.
 * All legal dates, declaration scope and rates arrive from the backend.
 * This function does not calculate public holiday entitlement or wages.
 */
export function getPharmacyHoursForDate(
  pharmacy: unknown,
  date: string,
  fallback: { startTime: string; endTime: string },
): PharmacyHours {
  if (!pharmacy || !date) {
    return {
      ...fallback, closed: false, label: 'selected day',
      isPublicHoliday: false, holidayNeedsReview: false,
      holidayStatus: 'NOT_SELECTED', partDayWindows: [],
    };
  }
  const record = asRecord(pharmacy);
  const holiday = getPharmacyHolidayInfo(date, pharmacy);
  const day = new Date(`${date}T00:00:00`);
  const weekday = Number.isNaN(day.getTime()) ? -1 : day.getDay();
  const prefix = holiday.fullDay
    ? 'public_holidays'
    : weekday === 0
      ? 'sundays'
      : weekday === 6
        ? 'saturdays'
        : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'][weekday - 1] || '';
  const name = holiday.fullDay
    ? 'public holiday'
    : weekday === 0
      ? 'Sunday'
      : weekday === 6
        ? 'Saturday'
        : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][weekday - 1] || 'selected day';
  const details = {
    label: holiday.partDayWindows.length ? `${name} (part-day public holiday)` : name,
    isPublicHoliday: holiday.fullDay,
    holidayNeedsReview: holiday.requiresReview,
    holidayStatus: holiday.status,
    partDayWindows: holiday.partDayWindows,
  };
  if (!prefix) {
    return { ...fallback, closed: false, ...details };
  }
  return {
    startTime: normalizeHour(readDayValue(record, prefix, 'start')) || fallback.startTime,
    endTime: normalizeHour(readDayValue(record, prefix, 'end')) || fallback.endTime,
    closed: Boolean(readDayValue(record, prefix, 'closed')),
    ...details,
  };
}
