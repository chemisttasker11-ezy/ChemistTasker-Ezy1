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
  const requiresReview = status !== 'VERIFIED' ||
    pendingYears.some(value => Number(value) === year);
  return { fullDay, partDayWindows, requiresReview, status };
}
