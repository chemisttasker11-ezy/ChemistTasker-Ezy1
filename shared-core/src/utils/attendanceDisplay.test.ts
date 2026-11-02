import { describe, expect, it } from 'vitest';
import { formatAttendanceMinutes } from './attendanceDisplay';

describe('formatAttendanceMinutes', () => {
  it('formats standard minute values with two-digit minutes', () => {
    expect(formatAttendanceMinutes(505)).toBe('8 h 25 min');
    expect(formatAttendanceMinutes(425)).toBe('7 h 05 min');
  });

  it('handles null, undefined and invalid numbers with an em-dash', () => {
    expect(formatAttendanceMinutes(null)).toBe('—');
    expect(formatAttendanceMinutes(undefined)).toBe('—');
    expect(formatAttendanceMinutes(Number.NaN)).toBe('—');
    expect(formatAttendanceMinutes(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('formats zero and exact hours correctly', () => {
    expect(formatAttendanceMinutes(0)).toBe('0 h 00 min');
    expect(formatAttendanceMinutes(60)).toBe('1 h 00 min');
    expect(formatAttendanceMinutes(120)).toBe('2 h 00 min');
  });

  it('formats durations less than one hour', () => {
    expect(formatAttendanceMinutes(5)).toBe('0 h 05 min');
    expect(formatAttendanceMinutes(45)).toBe('0 h 45 min');
  });

  it('rounds fractional minutes to nearest minute', () => {
    expect(formatAttendanceMinutes(504.6)).toBe('8 h 25 min');
    expect(formatAttendanceMinutes(425.2)).toBe('7 h 05 min');
  });

  it('formats negative durations', () => {
    expect(formatAttendanceMinutes(-75)).toBe('-1 h 15 min');
    expect(formatAttendanceMinutes(-5)).toBe('-0 h 05 min');
  });
});
