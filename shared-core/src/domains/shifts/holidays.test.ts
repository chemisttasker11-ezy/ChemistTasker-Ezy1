import { describe, expect, it } from 'vitest';
import { getPharmacyHolidayInfo } from './holidays';

describe('source-labelled pharmacy holidays across Vite/Next/Expo', () => {
  it('retains full-day public holidays without changing ordinary hours logic', () => {
    const result = getPharmacyHolidayInfo('2026-08-12', {
      public_holiday_dates: ['2026-01-26', '2026-08-12'],
      public_holiday_windows: [],
      public_holiday_calendar_status: { status: 'VERIFIED', pendingYears: [] },
    });
    expect(result).toEqual({
      fullDay: true, partDayWindows: [], requiresReview: false, status: 'VERIFIED',
    });
  });

  it('does not classify Queensland part-day Christmas Eve as a whole-day holiday', () => {
    const result = getPharmacyHolidayInfo('2027-12-24', {
      public_holiday_dates: ['2027-12-25'],
      public_holiday_windows: [{
        date: '2027-12-24', start: '18:00', end: '24:00',
        name: 'Christmas Eve', scope: 'STATE_PART_DAY',
      }],
      public_holiday_calendar_status: { status: 'VERIFIED', pendingYears: [] },
    });
    expect(result.fullDay).toBe(false);
    expect(result.partDayWindows).toHaveLength(1);
    expect(result.partDayWindows[0].start).toBe('18:00');
    expect(result.requiresReview).toBe(false);
  });

  it('preserves unverified 2027 local show status rather than guessing a date', () => {
    const record = {
      public_holiday_dates: ['2026-08-28'],
      public_holiday_calendar_status: {
        status: 'LOCAL_DECLARATION_PENDING', pendingYears: [2027],
      },
    };
    const result = getPharmacyHolidayInfo('2027-08-27', record);
    expect(result.fullDay).toBe(false);
    expect(result.requiresReview).toBe(true);
  });

  it('surfaces absent region metadata as not certified, not silently verified', () => {
    const result = getPharmacyHolidayInfo('2027-08-11', {});
    expect(result.requiresReview).toBe(true);
    expect(result.status).toBe('REGION_NOT_CONFIGURED');
  });

  it('accepts legacy camelCase API aliases without writing new holiday dates', () => {
    const result = getPharmacyHolidayInfo('2026-08-28', {
      publicHolidayDates: ['2026-08-28'],
      publicHolidayCalendarStatus: { status: 'VERIFIED' },
    });
    expect(result.fullDay).toBe(true);
    expect(result.requiresReview).toBe(false);
  });
});
