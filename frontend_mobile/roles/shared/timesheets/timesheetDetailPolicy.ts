import type { WorkforceTimesheetCheck, WorkforceTimesheetDetail } from '@chemisttasker/shared-core';

export const sourceFixCheckCodes = ['MISSING_CLOCK_IN', 'MISSING_CLOCK_OUT', 'UNRESOLVED_PROVISIONAL_ATTENDANCE'] as const;

export function canApproveTimesheet(detail: WorkforceTimesheetDetail | null, periodLocked: boolean): boolean {
  return !!detail
    && !periodLocked
    && detail.status !== 'APPROVED'
    && detail.status !== 'LOCKED'
    && !detail.needs_rebuild
    && !!detail.revision_number
    && (detail.effective_blocking_checks ?? detail.blocking_checks) === 0;
}

export function isSourceCorrectionRequired(check: Pick<WorkforceTimesheetCheck, 'code'>): boolean {
  return sourceFixCheckCodes.includes(check.code as typeof sourceFixCheckCodes[number]);
}

/** Times recorded in UTC are displayed in the pharmacy's timezone, not the device's location. */
export function formatPharmacyClock(value: string | null | undefined, timeZone: string | null | undefined): string {
  if (!value) return '—';
  const stamp = new Date(value);
  if (Number.isNaN(stamp.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en-AU', {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timeZone || 'Australia/Brisbane',
    }).format(stamp);
  } catch {
    return '—';
  }
}

export function formatTimesheetMinutes(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  const sign = minutes < 0 ? '−' : '';
  const absolute = Math.abs(minutes);
  return `${sign}${Math.floor(absolute / 60)}h ${String(Math.round(absolute % 60)).padStart(2, '0')}m`;
}
