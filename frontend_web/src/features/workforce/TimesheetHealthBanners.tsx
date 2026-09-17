import { Alert, Stack } from '@mui/material';
import type { TimesheetSummary } from './types';

export default function TimesheetHealthBanners({ summary }: { summary: TimesheetSummary | null }) {
  if (!summary) return null;
  return (
    <Stack spacing={1}>
      {summary.blocking_timesheets > 0 && (
        <Alert severity="error">
          {summary.blocking_timesheets} timesheet{summary.blocking_timesheets === 1 ? '' : 's'} contain blocking errors.
        </Alert>
      )}
      {summary.pending_leave_requests > 0 && (
        <Alert severity="info">
          {summary.pending_leave_requests} leave request{summary.pending_leave_requests === 1 ? '' : 's'} are waiting for review.
        </Alert>
      )}
      {summary.warning_checks > 0 && (
        <Alert severity="warning">
          {summary.warning_checks} timesheet check{summary.warning_checks === 1 ? '' : 's'} need review.
        </Alert>
      )}
      {summary.open_sessions > 0 && (
        <Alert severity="warning">
          {summary.open_sessions} attendance session{summary.open_sessions === 1 ? '' : 's'} are still open in this period.
        </Alert>
      )}
      {summary.blocking_timesheets === 0 && summary.warning_checks === 0 && summary.pending_leave_requests === 0 && (
        <Alert severity="success">No period-level exceptions are currently blocking review.</Alert>
      )}
    </Stack>
  );
}
