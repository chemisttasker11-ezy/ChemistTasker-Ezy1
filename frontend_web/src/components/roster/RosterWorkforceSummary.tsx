import { Alert, Box, Button, Chip, Divider, Stack, Typography } from '@mui/material';
import type { RosterAssignment } from '@chemisttasker/shared-core';

type Props = {
  assignment: RosterAssignment;
  onOpenTimesheets?: () => void;
  onOpenWorkforce?: () => void;
};

const minutes = (value?: number | null) => value == null ? '—' : `${(value / 60).toFixed(2)} h`;

const settlementLabel = (value?: string | null) => {
  if (value === 'PAYROLL') return 'ChemistTasker Payroll';
  if (value === 'TIMESHEET_ONLY') return 'Timesheet only';
  if (value === 'INVOICE') return 'Invoice';
  return value || 'Not captured';
};

export default function RosterWorkforceSummary({ assignment, onOpenTimesheets, onOpenWorkforce }: Props) {
  const status = assignment.workforceStatus;
  if (!status || assignment.user == null) return null;

  const timesheet = status.timesheet;
  const classification = status.awardClassification || '';
  const payBasis = status.payBasis === 'ABOVE_AWARD'
    ? 'Above award'
    : status.payBasis === 'AWARD'
      ? 'Award'
      : '';
  const employment = status.employmentType ? status.employmentType.replaceAll('_', ' ') : '';
  const missing = status.payrollMissingFields || [];

  return (
    <Box sx={{ mt: 1 }}>
      <Divider sx={{ mb: 2 }} />
      <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
        Workforce & settlement
      </Typography>

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
        <Chip size="small" label={settlementLabel(status.settlementChannel)} color={status.settlementChannel === 'PAYROLL' ? 'primary' : status.settlementChannel === 'INVOICE' ? 'secondary' : 'default'} />
        {employment && <Chip size="small" variant="outlined" label={employment} />}
        {payBasis && <Chip size="small" variant="outlined" label={payBasis} />}
        {classification && <Chip size="small" variant="outlined" label={classification.replaceAll('_', ' ')} />}
        {status.agreedRate && <Chip size="small" variant="outlined" label={`$ ${status.agreedRate}/hr`} />}
      </Stack>

      {status.payrollActivationRequired && !status.payrollReady && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          Payroll setup is deferred for this assignment
          {missing.length ? `: missing ${missing.map((field) => field.replaceAll('_', ' ')).join(', ')}.` : '.'}
        </Alert>
      )}

      {timesheet ? (
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', mb: 1.5 }}>
          <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap">
            <Box>
              <Typography variant="caption" color="text.secondary">Timesheet</Typography>
              <Typography variant="body2" fontWeight={700}>{timesheet.status.replaceAll('_', ' ')}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Rostered</Typography>
              <Typography variant="body2" fontWeight={700}>{minutes(timesheet.rosteredMinutes)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Worked</Typography>
              <Typography variant="body2" fontWeight={700}>{minutes(timesheet.workedMinutes)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Reviewed</Typography>
              <Typography variant="body2" fontWeight={700}>{minutes(timesheet.reviewedMinutes)}</Typography>
            </Box>
            {(timesheet.blockingChecks > 0 || timesheet.warningChecks > 0) && (
              <Box>
                <Typography variant="caption" color="text.secondary">Checks</Typography>
                <Typography variant="body2" fontWeight={700}>
                  {timesheet.blockingChecks} blocking · {timesheet.warningChecks} warning
                </Typography>
              </Box>
            )}
          </Stack>
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          No timesheet period currently covers this assignment date.
        </Typography>
      )}

      {(onOpenTimesheets || onOpenWorkforce) && (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {onOpenTimesheets && <Button size="small" variant="outlined" onClick={onOpenTimesheets}>Open timesheets</Button>}
          {onOpenWorkforce && <Button size="small" variant="text" onClick={onOpenWorkforce}>Employment & pay</Button>}
        </Stack>
      )}
    </Box>
  );
}
