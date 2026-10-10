import { Stack } from '@mui/material';
import { Pill } from '../../pages/dashboard/shiftCenter/ShiftCentreParts';
import { plural } from './timesheetDisplay';
import type { TimesheetSummary } from './types';

/** Period health as one row of readable counts; each pill says on hover what to do about it. */
export default function TimesheetHealthBanners({ summary }: { summary: TimesheetSummary | null }) {
  if (!summary) return null;
  const clear = summary.blocking_timesheets === 0 && summary.warning_checks === 0 && summary.pending_leave_requests === 0;
  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" aria-label="Period health" role="list" sx={{ '& > *': { minHeight: 28 } }}>
      {summary.blocking_timesheets > 0 && (
        <span role="listitem"><Pill tone="red" label={`${plural(summary.blocking_timesheets, 'timesheet')} with errors`} title="Errors block approval. Open each timesheet to fix them." /></span>
      )}
      {summary.warning_checks > 0 && (
        <span role="listitem"><Pill tone="amber" label={`${plural(summary.warning_checks, 'check')} to review`} title="Warnings don't block approval, but resolve or waive them with a reason." /></span>
      )}
      {summary.pending_leave_requests > 0 && (
        <span role="listitem"><Pill tone="blue" label={`${plural(summary.pending_leave_requests, 'leave request')} waiting`} title="Decide these in Leave so the hours count correctly." /></span>
      )}
      {summary.open_sessions > 0 && (
        <span role="listitem"><Pill tone="amber" label={`${plural(summary.open_sessions, 'worker')} still clocked in`} title="Open attendance sessions in this period. They count once the worker clocks out." /></span>
      )}
      {summary.ready_timesheets > 0 && (
        <span role="listitem"><Pill tone="green" label={`${summary.ready_timesheets} ready to approve`} title="No open errors on these timesheets." /></span>
      )}
      {clear && <span role="listitem"><Pill tone="green" label="No exceptions" title="Nothing in this period is blocking review." /></span>}
    </Stack>
  );
}
