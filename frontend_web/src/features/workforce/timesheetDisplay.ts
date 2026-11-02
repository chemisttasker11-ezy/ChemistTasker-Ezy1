// Deep import: the shared-core root uses extensionless ESM imports that node --test can't load (the tests import this file).
import { formatAttendanceMinutes } from '@chemisttasker/shared-core/dist/utils/attendanceDisplay.js';
import type { StatusTone } from '../../components/ui/tone';
import type { TimesheetPeriod, TimesheetStatus } from './types';

type Display = { label: string; tone: StatusTone; hint: string };

/** Timesheet statuses in plain words, shared by the manager page, the detail drawer and My Hours. */
export const TIMESHEET_STATUS: Record<TimesheetStatus, Display> = {
  OPEN: { label: 'Open', tone: 'neutral', hint: 'Still collecting attendance for this period.' },
  NEEDS_REVIEW: { label: 'Needs review', tone: 'amber', hint: 'Has checks to resolve before it can be approved.' },
  READY: { label: 'Ready to approve', tone: 'blue', hint: 'No open errors. Review the hours and approve.' },
  SUBMITTED: { label: 'Submitted', tone: 'cyan', hint: 'Sent for approval.' },
  APPROVED: { label: 'Approved', tone: 'green', hint: 'Hours approved for this revision.' },
  REOPENED: { label: 'Reopened', tone: 'amber', hint: 'Reopened after approval. Approve it again when fixed.' },
};

export const PERIOD_STATUS: Record<TimesheetPeriod['status'], Display> = {
  OPEN: { label: 'Open', tone: 'neutral', hint: 'Timesheets can still change.' },
  REVIEW: { label: 'In review', tone: 'amber', hint: 'Timesheets are being reviewed.' },
  APPROVED: { label: 'Approved', tone: 'green', hint: 'All timesheets approved. Lock the period when ready.' },
  LOCKED: { label: 'Locked', tone: 'navy', hint: 'Frozen for payroll. Use Correct period to change it.' },
};

export const timesheetStatus = (status: string): Display =>
  TIMESHEET_STATUS[status as TimesheetStatus] ?? { label: status.replaceAll('_', ' ').toLowerCase(), tone: 'neutral', hint: '' };

/** 450 → "7 h 30 min", 505 → "8 h 25 min"; null → "—". */
export const formatHours = (minutes: number | null | undefined): string => formatAttendanceMinutes(minutes);

/**
 * Approve button label showing the worked time being approved.
 * e.g. reviewed 0 / worked 425 -> "Approve 7 h 05 min"
 */
export const approveButtonLabel = (
  input: number | null | undefined | { worked_minutes?: number | null | undefined; reviewed_minutes?: number | null | undefined }
): string => {
  const minutes = typeof input === 'object' && input !== null ? input.worked_minutes : input;
  return `Approve ${formatHours(minutes)}`;
};

export const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
