/**
 * Attendance presentation helpers.
 */

/**
 * Formats an attendance duration in minutes into hours and minutes display.
 * E.g. 505 -> "8 h 25 min", 425 -> "7 h 05 min", null -> "—".
 */
export function formatAttendanceMinutes(minutes: number | null | undefined): string {
  if (minutes == null || typeof minutes !== 'number' || !Number.isFinite(minutes)) {
    return '—';
  }

  const total = Math.round(Math.abs(minutes));
  const sign = minutes < 0 && total > 0 ? '-' : '';
  const hours = Math.floor(total / 60);
  const remainingMinutes = total % 60;

  return `${sign}${hours} h ${String(remainingMinutes).padStart(2, '0')} min`;
}
