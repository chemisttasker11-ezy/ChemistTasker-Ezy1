import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import {
  addMissingPunch,
  addTimesheetComment,
  approveTimesheet,
  decideTimesheetCheck,
  fetchTimesheetDetail,
  recalculateTimesheet,
  reopenTimesheet,
} from './api';
import type { TimesheetCheck, TimesheetDetail } from './types';

const minutes = (value: number | null | undefined) => value == null ? '—' : `${(value / 60).toFixed(2)} h`;
const clock = (value: string | null, timeZone?: string) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
};
const dateLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });

function CheckCard({ check, onChanged, onFixSource }: { check: TimesheetCheck; onChanged: () => Promise<void>; onFixSource?: (check: TimesheetCheck) => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const resolved = check.decision?.decision === 'RESOLVED' || check.decision?.decision === 'WAIVED';
  const severity = check.severity === 'BLOCKER' ? 'error' : check.severity === 'WARNING' ? 'warning' : 'info';
  const sourceRequired = ['MISSING_CLOCK_IN', 'MISSING_CLOCK_OUT', 'UNRESOLVED_PROVISIONAL_ATTENDANCE'].includes(check.code);
  const decide = async (decision: 'RESOLVED' | 'WAIVED' | 'REOPENED') => {
    setBusy(true);
    try {
      await decideTimesheetCheck(check.id, decision, decision === 'REOPENED' ? (reason || 'Reopened for review') : reason);
      setReason('');
      await onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Alert severity={severity} variant={resolved ? 'outlined' : 'standard'}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Typography fontWeight={800}>{check.message}</Typography>
          <Chip size="small" label={check.code.replaceAll('_', ' ')} />
          {resolved && <Chip size="small" color="success" icon={<CheckCircleOutlineIcon />} label={check.decision?.decision} />}
        </Stack>
        {check.work_date && <Typography variant="caption">{dateLabel(check.work_date)}</Typography>}
        {sourceRequired && !resolved ? (
          <Stack direction="row" spacing={1}>
            {check.code === 'UNRESOLVED_PROVISIONAL_ATTENDANCE' ? (
              <Button size="small" variant="contained" onClick={() => window.location.assign('/dashboard/attendance/reviews')}>Open attendance review</Button>
            ) : (
              <Button size="small" variant="contained" onClick={() => onFixSource?.(check)}>Add missing punch</Button>
            )}
            <Typography variant="caption" color="text.secondary" alignSelf="center">This blocker cannot be waived from the timesheet.</Typography>
          </Stack>
        ) : <>
          <TextField
            size="small"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={resolved ? 'Reason to reopen' : 'Resolution / waiver reason'}
            fullWidth
          />
          <Stack direction="row" spacing={1}>
            {!resolved ? <>
              <Button disabled={busy || !reason.trim()} size="small" variant="contained" onClick={() => decide('RESOLVED')}>Resolve</Button>
              <Button disabled={busy || !reason.trim()} size="small" variant="outlined" onClick={() => decide('WAIVED')}>Waive</Button>
            </> : (
              <Button disabled={busy} size="small" variant="outlined" onClick={() => decide('REOPENED')}>Reopen check</Button>
            )}
          </Stack>
        </>}
      </Stack>
    </Alert>
  );
}

export default function TimesheetDetailDrawer({
  timesheetId,
  open,
  onClose,
  onChanged,
  managerMode = true,
}: {
  timesheetId: number | null;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  managerMode?: boolean;
}) {
  const [data, setData] = useState<TimesheetDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [comment, setComment] = useState('');
  const [workerVisible, setWorkerVisible] = useState(true);
  const [reopenReason, setReopenReason] = useState('');
  const [missingPunchCheck, setMissingPunchCheck] = useState<TimesheetCheck | null>(null);
  const [missingPunchAt, setMissingPunchAt] = useState('');
  const [missingPunchReason, setMissingPunchReason] = useState('');

  const load = async () => {
    if (!timesheetId) return;
    setLoading(true);
    setActionError('');
    try {
      setData(await fetchTimesheetDetail(timesheetId));
    } catch (error: any) {
      setActionError(error?.response?.data?.error || error?.message || 'Unable to load timesheet.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (open) void load(); }, [open, timesheetId]);

  const openBlockers = data?.effective_blocking_checks ?? data?.blocking_checks ?? 0;
  const days = useMemo(() => data?.snapshot?.days ?? [], [data]);

  const run = async (fn: () => Promise<any>) => {
    setLoading(true);
    setActionError('');
    try {
      const next = await fn();
      if (next?.id) setData(next);
      else await load();
      onChanged?.();
    } catch (error: any) {
      const payload = error?.response?.data;
      setActionError(payload?.error || payload?.message || (payload ? JSON.stringify(payload) : error?.message) || 'Action failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', md: 760 }, p: 0 } }}>
      <Stack sx={{ height: '100%' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, py: 2, borderBottom: '1px solid #E5EAF2' }}>
          <Box>
            <Typography variant="h6" fontWeight={900}>{data?.worker?.name || 'Timesheet'}</Typography>
            {data?.snapshot?.period && <Typography variant="body2" color="text.secondary">{data.snapshot.period.start_date} – {data.snapshot.period.end_date}</Typography>}
          </Box>
          <Stack direction="row" spacing={1}>
            {managerMode && <IconButton aria-label="Recalculate" onClick={() => timesheetId && run(() => recalculateTimesheet(timesheetId))}><RefreshIcon /></IconButton>}
            <IconButton aria-label="Close" onClick={onClose}><CloseIcon /></IconButton>
          </Stack>
        </Stack>

        <Box sx={{ p: 3, overflowY: 'auto', flex: 1 }}>
          {loading && !data && <Box textAlign="center" py={8}><CircularProgress /></Box>}
          {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}
          {data && <Stack spacing={3}>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Chip label={`Status: ${data.status}`} color={data.status === 'APPROVED' ? 'success' : data.status === 'NEEDS_REVIEW' ? 'warning' : 'default'} />
              <Chip label={`Revision ${data.revision_number ?? '—'}`} />
              <Chip label={`${openBlockers} blocker${openBlockers === 1 ? '' : 's'}`} color={openBlockers ? 'error' : 'success'} />
              <Chip label={`${data.effective_warning_checks ?? data.warning_checks} warning${(data.effective_warning_checks ?? data.warning_checks) === 1 ? '' : 's'}`} color="warning" variant="outlined" />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              {[['Rostered gross', data.rostered_minutes], ['Planned breaks', data.planned_break_minutes], ['Contracted', data.contracted_minutes], ['Worked', data.worked_minutes], ['Approved leave', data.approved_leave_minutes], ['Reviewed', data.reviewed_minutes]].map(([label, value]) => (
                <Box key={String(label)} sx={{ p: 1.5, flex: 1, minWidth: 100, border: '1px solid #E5EAF2', borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                  <Typography fontWeight={900}>{minutes(value as number | null)}</Typography>
                </Box>
              ))}
            </Stack>

            <Box>
              <Typography variant="h6" fontWeight={900} mb={1}>Days</Typography>
              <Stack spacing={1.5}>
                {days.map((day) => (
                  <Box key={`${day.date}-${day.session_id ?? 'roster'}-${day.assignment_id ?? 'none'}`} sx={{ border: '1px solid #E5EAF2', borderRadius: 2.5, p: 2 }}>
                    <Typography fontWeight={900}>{dateLabel(day.date)}</Typography>
                    <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: 'minmax(90px,1fr) 1fr 1fr', gap: 1 }}>
                      <Typography variant="caption" color="text.secondary" />
                      <Typography variant="caption" fontWeight={800}>Actual</Typography>
                      <Typography variant="caption" fontWeight={800}>Rostered</Typography>
                      <Typography variant="body2">Start</Typography><Typography variant="body2">{clock(day.actual_start, data.snapshot.period.timezone)}</Typography><Typography variant="body2">{clock(day.rostered_start, data.snapshot.period.timezone)}</Typography>
                      <Typography variant="body2">Finish</Typography><Typography variant="body2">{clock(day.actual_end, data.snapshot.period.timezone)}</Typography><Typography variant="body2">{clock(day.rostered_end, data.snapshot.period.timezone)}</Typography>
                      <Typography variant="body2">Break</Typography><Typography variant="body2">{day.recorded_break_minutes} min</Typography><Typography variant="body2">{day.planned_break_minutes} min</Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={900} mb={1}>Checks</Typography>
              <Stack spacing={1.25}>
                {data.checks.length === 0 && <Alert severity="success">No checks for this revision.</Alert>}
                {data.checks.map((check) => <CheckCard key={check.id} check={check} onChanged={load} onFixSource={(next) => { setMissingPunchCheck(next); setMissingPunchAt(''); setMissingPunchReason(''); }} />)}
              </Stack>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={900} mb={1}>Comments</Typography>
              <Stack spacing={1}>
                {data.comments.map((item) => (
                  <Box key={item.id} sx={{ bgcolor: '#F7F9FC', borderRadius: 2, p: 1.5 }}>
                    <Typography variant="body2" fontWeight={800}>{item.author_name}</Typography>
                    <Typography variant="body2">{item.body}</Typography>
                    <Typography variant="caption" color="text.secondary">{new Date(item.created_at).toLocaleString()}</Typography>
                  </Box>
                ))}
                <TextField multiline minRows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment" />
                {managerMode && <FormControlLabel control={<Switch checked={workerVisible} onChange={(_, v) => setWorkerVisible(v)} />} label="Visible to worker" />}
                <Button disabled={!comment.trim()} variant="outlined" onClick={() => timesheetId && run(async () => { await addTimesheetComment(timesheetId, comment, workerVisible); setComment(''); return fetchTimesheetDetail(timesheetId); })}>Add comment</Button>
              </Stack>
            </Box>

            {managerMode && <>
              <Divider />
              <Stack spacing={1.5}>
                <Button
                  size="large"
                  variant="contained"
                  disabled={openBlockers > 0 || !data.revision_number || data.needs_rebuild || data.status === 'APPROVED'}
                  onClick={() => timesheetId && data.revision_number && run(() => approveTimesheet(timesheetId, data.revision_number!))}
                >Approve reviewed time</Button>
                {data.status === 'APPROVED' && <>
                  <TextField value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} label="Reason to reopen" />
                  <Button color="warning" variant="outlined" disabled={!reopenReason.trim()} onClick={() => timesheetId && run(() => reopenTimesheet(timesheetId, reopenReason))}>Reopen timesheet</Button>
                </>}
              </Stack>
            </>}
          </Stack>}
        </Box>
      </Stack>
      <Dialog open={missingPunchCheck != null} onClose={() => setMissingPunchCheck(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Add missing attendance punch</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} pt={0.5}>
            <Alert severity="warning">This creates a new append-only manager attendance event. It does not edit or delete existing evidence.</Alert>
            <TextField
              type="datetime-local"
              label="Actual time"
              InputLabelProps={{ shrink: true }}
              value={missingPunchAt}
              onChange={(e) => setMissingPunchAt(e.target.value)}
            />
            <TextField label="Reason" multiline minRows={2} value={missingPunchReason} onChange={(e) => setMissingPunchReason(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMissingPunchCheck(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!timesheetId || !missingPunchCheck || !missingPunchAt || !missingPunchReason.trim()}
            onClick={() => {
              if (!timesheetId || !missingPunchCheck) return;
              const sessionId = Number((missingPunchCheck.details as any)?.session_id);
              const eventType = missingPunchCheck.code === 'MISSING_CLOCK_IN' ? 'CLOCK_IN' : 'CLOCK_OUT';
              void run(async () => {
                const result = await addMissingPunch(timesheetId, {
                  sessionId,
                  eventType,
                  occurredAtLocal: missingPunchAt,
                  reason: missingPunchReason,
                });
                setMissingPunchCheck(null);
                setMissingPunchAt('');
                setMissingPunchReason('');
                return result.timesheet;
              });
            }}
          >Save missing punch</Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
}
