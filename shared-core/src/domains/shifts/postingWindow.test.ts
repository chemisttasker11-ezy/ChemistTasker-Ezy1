import { describe, expect, it } from 'vitest';
import { shiftPostingDateWindow, splitPostableDates } from './postingWindow';

describe('M5-04 post-shift date window', () => {
  it.each([
    ['2026-11-07', '2027-03-31'],
    ['2026-12-31', '2027-04-30'],
    ['2027-10-30', '2028-02-29'],
    ['2028-02-29', '2028-06-30'],
    ['2026-03-31', '2026-07-31'],
  ])('keeps today %s through the full fourth following month %s', (today, maxIso) => {
    expect(shiftPostingDateWindow(today)).toEqual({ minIso: today, maxIso });
  });
  it('sorts and deduplicates valid days without DST midnight conversion', () => {
    expect(splitPostableDates([
      '2026-11-06', '2026-11-08', '2027-03-31', '2027-04-01',
      '2026-11-08', 'not a date',
    ], '2026-11-07')).toEqual({
      valid: ['2026-11-08', '2027-03-31'],
      past: ['2026-11-06'],
      late: ['2027-04-01'],
    });
  });
  it('accepts local Sydney DST transition days as calendar dates', () => {
    expect(splitPostableDates(['2026-10-04', '2026-10-05'], '2026-10-04').valid)
      .toEqual(['2026-10-04', '2026-10-05']);
  });
  it('discards malformed calendar days, never returns Invalid Date', () => {
    expect(splitPostableDates(['2026-02-30', '2026-13-01', 'Invalid Date'], '2026-01-01'))
      .toEqual({ valid: [], past: [], late: [] });
  });
});
