import { describe, expect, it } from 'vitest';
import { getPharmacyHolidayInfo, getPharmacyHoursForDate } from './holidays';

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

  it('does not falsely flag published 2026 show days when only 2027 is pending', () => {
    const pharmacy = {
      public_holiday_dates: ['2026-08-28'],
      public_holiday_calendar_status: {
        status: 'LOCAL_DECLARATION_PENDING',
        pendingYears: [2027],
        verifiedYears: [2026],
      },
    };
    const published = getPharmacyHolidayInfo('2026-08-28', pharmacy);
    expect(published.fullDay).toBe(true);
    expect(published.requiresReview).toBe(false);
    expect(published.status).toBe('VERIFIED');
    const awaiting = getPharmacyHolidayInfo('2027-08-27', pharmacy);
    expect(awaiting.requiresReview).toBe(true);
    expect(awaiting.status).toBe('LOCAL_DECLARATION_PENDING');
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


describe('cross-client pharmacy hours: one backend data contract', () => {
  const webFallback = {startTime: '09:00', endTime: '17:00'};
  it('resolves Gold Coast Show locally, not by user residence', () => {
    const gold = getPharmacyHoursForDate({
      public_holiday_dates: ['2026-08-28'],
      public_holiday_calendar_status: {status: 'VERIFIED'},
      public_holidays_start: '10:00', public_holidays_end: '16:00',
      friday_start: '08:00', friday_end: '21:00',
    }, '2026-08-28', webFallback);
    const brisbane = getPharmacyHoursForDate({
      public_holiday_dates: ['2026-08-12'],
      public_holiday_calendar_status: {status: 'VERIFIED'},
      friday_start: '08:00', friday_end: '21:00',
    }, '2026-08-28', webFallback);
    expect(gold).toMatchObject({
      isPublicHoliday: true, label: 'public holiday',
      startTime: '10:00', endTime: '16:00', holidayNeedsReview: false,
    });
    expect(brisbane).toMatchObject({
      isPublicHoliday: false, label: 'Friday',
      startTime: '08:00', endTime: '21:00',
    });
  });
  it('part-day Christmas Eve keeps weekday hours and exposes 18:00 cutoff', () => {
    const result = getPharmacyHoursForDate({
      public_holiday_dates: ['2027-12-25'],
      public_holiday_windows: [{
        date: '2027-12-24', start: '18:00', end: '24:00',
        name: 'Christmas Eve', scope: 'STATE_PART_DAY',
      }],
      public_holiday_calendar_status: {status: 'VERIFIED'},
      friday_start: '08:30', friday_end: '21:00',
    }, '2027-12-24', webFallback);
    expect(result.isPublicHoliday).toBe(false);
    expect(result.label).toBe('Friday (part-day public holiday)');
    expect(result.startTime).toBe('08:30');
    expect(result.partDayWindows[0].start).toBe('18:00');
  });
  it('pending year is visible on all clients, published year is not flagged', () => {
    const data = {
      public_holiday_dates: ['2026-08-28'],
      public_holiday_calendar_status: {
        status: 'LOCAL_DECLARATION_PENDING', pendingYears: [2027],
      },
    };
    expect(getPharmacyHoursForDate(data, '2026-08-28', webFallback).holidayNeedsReview).toBe(false);
    expect(getPharmacyHoursForDate(data, '2027-08-27', webFallback).holidayNeedsReview).toBe(true);
  });
  it('camelCase aliases and closures are interpreted identically', () => {
    const result = getPharmacyHoursForDate({
      publicHolidayDates: ['2026-10-05'],
      publicHolidayCalendarStatus: {status: 'VERIFIED'},
      publicHolidaysClosed: true,
    }, '2026-10-05', webFallback);
    expect(result.closed).toBe(true);
    expect(result.isPublicHoliday).toBe(true);
  });
});
