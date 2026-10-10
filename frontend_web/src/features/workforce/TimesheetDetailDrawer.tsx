import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { CheckCircle2, RefreshCw, X } from 'lucide-react';
import dayjs from 'dayjs';
import {
  addMissingPunch,
  addTimesheetComment,
  approveTimesheet,
  decideTimesheetCheck,
  fetchTimesheetDetail,
  recalculateTimesheet,
  reopenTimesheet,
} from './api';
import DashboardContentState from '../../components/dashboard/DashboardContentState';
import { Pill } from '../../components/ui/Pill';
import { type StatusTone } from '../../components/ui/tone';
import { formatHours, plural, timesheetStatus } from './timesheetDisplay';
import type { TimesheetCheck, TimesheetDetail } from './types';

const clock = (value: string | null, timeZone?: string) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
};
const dateLabel = (value: string) => dayjs(value).format('dddd D MMM');
const shortDate = (value: string) => dayjs(value).format('D MMM YYYY');
const errorText = (error: any, fallback: string) => {
  const payload = error?.response?.data;
  return payload?.error || payload?.message || payload?.detail || error?.message || fallback;
};

const SEVERITY: Record<string, { label: string; tone: StatusTone; edge: string }> = {
  BLOCKER: { label: 'Error', tone: 'red', edge: 'var(--ct-status-red-fg)' },
  WARNING: { label: 'Warning', tone: 'amber', edge: 'var(--ct-status-amber-fg)' },
  INFO: { label: 'Note', tone: 'blue', edge: 'var(--ct-tone-blue-fg)' },
};
const DECISION: Record<string, string> = { RESOLVED: 'Resolved', WAIVED: 'Waived', REOPENED: 'Reopened' };

const sectionTitleSx = { fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 18, color: 'var(--ct-text-primary)', mb: 1.25 } as const;
const boxSx = { border: '1px solid var(--ct-border-color)', borderRadius: '14px', bgcolor: 'var(--ct-surface-bg)' } as const;

function CheckCard({ check, onChanged, onFixSource }: { check: TimesheetCheck; onChanged: () => Promise<void>; onFixSource?: (check: TimesheetCheck) => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'' | 'RESOLVED' | 'WAIVED' | 'REOPENED'>('');
  const [failed, setFailed] = useState('');
  const resolved = check.decision?.decision === 'RESOLVED' || check.decision?.decision === 'WAIVED';
  const severity = SEVERITY[check.severity] ?? SEVERITY.INFO;
  const sourceRequired = ['MISSING_CLOCK_IN', 'MISSING_CLOCK_OUT', 'UNRESOLVED_PROVISIONAL_ATTENDANCE'].includes(check.code);
  const decide = async (decision: 'RESOLVED' | 'WAIVED' | 'REOPENED') => {
    setBusy(decision);
    setFailed('');
    try {
      await decideTimesheetCheck(check.id, decision, decision === 'REOPENED' ? (reason || 'Reopened for review') : reason);
      setReason('');
      await onChanged();
    } catch (error: any) {
      setFailed(errorText(error, "We couldn't save that decision."));
    } finally {
      setBusy('');
    }
  };
  const spin = (kind: typeof busy) => (busy === kind ? <CircularProgress size={14} color="inherit" /> : undefined);
  return (
    <Paper variant="outlined" sx={{ ...boxSx, p: 2, borderLeft: `4px solid ${resolved ? 'var(--ct-border-color)' : severity.edge}` }}>
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Pill tone={resolved ? 'neutral' : severity.tone} label={severity.label} />
          {resolved && <Pill tone="green" icon={<CheckCircle2 />} label={DECISION[check.decision!.decision] ?? check.decision!.decision} title={check.decision?.reason || undefined} />}
          {check.work_date && <Typography variant="body2" color="text.secondary">{dateLabel(check.work_date)}</Typography>}
        </Stack>
        <Typography sx={{ fontWeight: 600, color: 'var(--ct-text-primary)' }}>{check.message}</Typography>
        {failed && <Alert severity="error" onClose={() => setFailed('')}>{failed}</Alert>}
        {sourceRequired && !resolved ? (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            {check.code === 'UNRESOLVED_PROVISIONAL_ATTENDANCE' ? (
              <Button size="small" variant="contained" onClick={() => window.location.assign('/dashboard/attendance/reviews')} sx={{ minHeight: 40 }}>Open attendance approvals</Button>
            ) : (
              <Button size="small" variant="contained" onClick={() => onFixSource?.(check)} sx={{ minHeight: 40 }}>Add missing clock time</Button>
            )}
            <Typography variant="body2" color="text.secondary">Fix the attendance record; this can't be waived.</Typography>
          </Stack>
        ) : <>
          <TextField
            size="small"
            label={resolved ? 'Reason to reopen (optional)' : 'Reason'}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            helperText={resolved ? undefined : 'Needed to resolve or waive.'}
            disabled={busy !== ''}
            fullWidth
          />
          <Stack direction="row" spacing={1}>
            {!resolved ? <>
              <Button disabled={busy !== '' || !reason.trim()} size="small" variant="contained" onClick={() => decide('RESOLVED')} startIcon={spin('RESOLVED')} sx={{ minHeight: 40 }}>Resolve</Button>
              <Button disabled={busy !== '' || !reason.trim()} size="small" variant="outlined" onClick={() => decide('WAIVED')} startIcon={spin('WAIVED')} sx={{ minHeight: 40 }}>Waive</Button>
            </> : (
              <Button disabled={busy !== ''} size="small" variant="outlined" onClick={() => decide('REOPENED')} startIcon={spin('REOPENED')} sx={{ minHeight: 40 }}>Reopen check</Button>
            )}
          </Stack>
        </>}
      </Stack>
    </Paper>
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

  const [pending, setPending] = useState('');
  const run = async (kind: string, fn: () => Promise<any>) => {
    setLoading(true);
    setPending(kind);
    setActionError('');
    try {
      const next = await fn();
      if (next?.id) setData(next);
      else await load();
      onChanged?.();
    } catch (error: any) {
      setActionError(errorText(error, "That didn't save. Try again."));
    } finally {
      setLoading(false);
      setPending('');
    }
  };
  const spin = (kind: string, icon?: ReactElement) => (pending === kind ? <CircularProgress size={16} color="inherit" /> : icon);
  const status = data ? timesheetStatus(data.status) : null;
  const warnings = data ? (data.effective_warning_checks ?? data.warning_checks) : 0;
  const timeZone = data?.snapshot?.period?.timezone;
  const totals: Array<[string, number | null]> = data ? [
    ['Worked', data.worked_minutes],
    ['Rostered', data.rostered_minutes],
    ['Planned breaks', data.planned_break_minutes],
    ['Contracted', data.contracted_minutes],
    ['Approved leave', data.approved_leave_minutes],
    ['Reviewed', data.reviewed_minutes],
  ] : [];
  const approveBlockedReason = !data ? '' : data.status === 'APPROVED' ? '' : openBlockers > 0
    ? `Fix ${plural(openBlockers, 'error')} first.`
    : data.needs_rebuild || !data.revision_number ? 'Recalculate this timesheet first.' : '';

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', md: 760 }, p: 0, bgcolor: 'var(--ct-page-bg, var(--ct-surface-bg))' } }}>
      <Stack sx={{ height: '100%' }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2} sx={{ px: { xs: 2, md: 3 }, py: 2, borderBottom: '1px solid var(--ct-border-color)', bgcolor: 'var(--ct-surface-bg)' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 22, color: 'var(--ct-text-primary)', overflowWrap: 'anywhere' }}>
              {data?.worker?.name || 'Timesheet'}
            </Typography>
            {data?.snapshot?.period && (
              <Typography variant="body2" color="text.secondary">
                {shortDate(data.snapshot.period.start_date)} – {shortDate(data.snapshot.period.end_date)}
                {data.snapshot.pharmacy?.name ? ` · ${data.snapshot.pharmacy.name}` : ''}
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
            {managerMode && data && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => timesheetId && run('recalculate', () => recalculateTimesheet(timesheetId))}
                disabled={loading}
                startIcon={spin('recalculate', <RefreshCw size={16} />)}
                sx={{ minHeight: 40 }}
              >
                Recalculate
              </Button>
            )}
            <IconButton aria-label="Close timesheet" onClick={onClose} sx={{ width: 44, height: 44 }}><X size={20} /></IconButton>
          </Stack>
        </Stack>

        <Box sx={{ p: { xs: 2, md: 3 }, overflowY: 'auto', flex: 1 }} aria-busy={loading}>
          {!data && loading && <DashboardContentState compact kind="loading" title="Loading timesheet" />}
          {!data && !loading && actionError && (
            <DashboardContentState compact kind="error" title="We couldn't load this timesheet" description="Check your connection and try again." actionLabel="Try again" onAction={() => void load()} />
          )}
          {data && actionError && <Alert severity="error" onClose={() => setActionError('')} sx={{ mb: 2 }}>{actionError}</Alert>}
          {data && <Stack spacing={3}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {status && <Pill tone={status.tone} label={status.label} title={status.hint || undefined} />}
              {data.needs_rebuild && <Pill tone="amber" label="Needs recalculating" title="Attendance, roster or leave changed since this was calculated." />}
              <Pill tone={openBlockers ? 'red' : 'green'} label={openBlockers ? plural(openBlockers, 'error') : 'No errors'} />
              {warnings > 0 && <Pill tone="amber" label={plural(warnings, 'warning')} />}
              {data.revision_number != null && <Pill tone="neutral" outlined label={`Version ${data.revision_number}`} title="Approval applies to this version of the hours." />}
            </Stack>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
              {totals.map(([label, value]) => (
                <Box key={label} sx={{ ...boxSx, p: 1.5 }}>
                  <Typography variant="body2" color="text.secondary">{label}</Typography>
                  <Typography sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 20, color: 'var(--ct-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatHours(value)}
                  </Typography>
                </Box>
              ))}
            </Box>

            <Box component="section">
              <Typography component="h3" sx={sectionTitleSx}>Days</Typography>
              {days.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No rostered or worked days in this period.</Typography>
              ) : (
                <Stack spacing={1.25}>
                  {days.map((day) => (
                    <Box key={`${day.date}-${day.session_id ?? 'roster'}-${day.assignment_id ?? 'none'}`} sx={{ ...boxSx, p: 2 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
                        <Typography sx={{ fontWeight: 600, color: 'var(--ct-text-primary)' }}>{dateLabel(day.date)}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--ct-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatHours(day.worked_minutes)} worked</Typography>
                      </Stack>
                      <Box sx={{ mt: 1.25, display: 'grid', gridTemplateColumns: 'minmax(64px, auto) 1fr 1fr', columnGap: 2, rowGap: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                        <span />
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--ct-text-secondary)' }}>Actual</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--ct-text-secondary)' }}>Rostered</Typography>
                        <Typography variant="body2" color="text.secondary">Start</Typography><Typography variant="body2">{clock(day.actual_start, timeZone)}</Typography><Typography variant="body2">{clock(day.rostered_start, timeZone)}</Typography>
                        <Typography variant="body2" color="text.secondary">Finish</Typography><Typography variant="body2">{clock(day.actual_end, timeZone)}</Typography><Typography variant="body2">{clock(day.rostered_end, timeZone)}</Typography>
                        <Typography variant="body2" color="text.secondary">Break</Typography><Typography variant="body2">{day.recorded_break_minutes} min</Typography><Typography variant="body2">{day.planned_break_minutes} min</Typography>
                      </Box>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>

            <Box component="section">
              <Typography component="h3" sx={sectionTitleSx}>Checks</Typography>
              <Stack spacing={1.25}>
                {data.checks.length === 0 && <Typography variant="body2" color="text.secondary">No checks on this version. Everything matches.</Typography>}
                {data.checks.map((check) => <CheckCard key={check.id} check={check} onChanged={load} onFixSource={(next) => { setMissingPunchCheck(next); setMissingPunchAt(''); setMissingPunchReason(''); }} />)}
              </Stack>
            </Box>

            <Box component="section">
              <Typography component="h3" sx={sectionTitleSx}>Comments</Typography>
              <Stack spacing={1.25}>
                {data.comments.length === 0 && <Typography variant="body2" color="text.secondary">No comments yet.</Typography>}
                {data.comments.map((item) => (
                  <Box key={item.id} sx={{ bgcolor: 'var(--ct-subtle-bg)', borderRadius: '12px', p: 1.5 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--ct-text-primary)' }}>{item.author_name}</Typography>
                      {managerMode && !item.worker_visible && <Pill tone="neutral" outlined label="Managers only" />}
                    </Stack>
                    <Typography variant="body2" sx={{ color: 'var(--ct-text-primary)', whiteSpace: 'pre-wrap' }}>{item.body}</Typography>
                    <Typography variant="caption" color="text.secondary">{new Date(item.created_at).toLocaleString()}</Typography>
                  </Box>
                ))}
                <TextField multiline minRows={2} label="Add a comment" value={comment} onChange={(e) => setComment(e.target.value)} disabled={pending === 'comment'} />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between">
                  {managerMode ? <FormControlLabel control={<Switch checked={workerVisible} onChange={(_, v) => setWorkerVisible(v)} />} label="Worker can see this comment" /> : <span />}
                  <Button
                    disabled={!comment.trim() || loading}
                    variant="outlined"
                    startIcon={spin('comment')}
                    sx={{ minHeight: 40 }}
                    onClick={() => timesheetId && run('comment', async () => { await addTimesheetComment(timesheetId, comment, workerVisible); setComment(''); return fetchTimesheetDetail(timesheetId); })}
                  >
                    Add comment
                  </Button>
                </Stack>
              </Stack>
            </Box>

            {managerMode && <>
              <Divider />
              <Stack spacing={1.5}>
                {data.status === 'APPROVED' ? <>
                  <Typography variant="body2" color="text.secondary">Approved. To change these hours, reopen the timesheet with a reason.</Typography>
                  <TextField value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} label="Reason to reopen" disabled={loading} />
                  <Button color="warning" variant="outlined" disabled={!reopenReason.trim() || loading} startIcon={spin('reopen')} sx={{ minHeight: 44 }} onClick={() => timesheetId && run('reopen', () => reopenTimesheet(timesheetId, reopenReason))}>
                    Reopen timesheet
                  </Button>
                </> : <>
                  <Button
                    size="large"
                    variant="contained"
                    disabled={Boolean(approveBlockedReason) || loading}
                    startIcon={spin('approve', <CheckCircle2 size={18} />)}
                    onClick={() => timesheetId && data.revision_number && run('approve', () => approveTimesheet(timesheetId, data.revision_number!))}
                  >
                    Approve {formatHours(data.reviewed_minutes)}
                  </Button>
                  {approveBlockedReason && <Typography variant="body2" color="text.secondary" textAlign="center">{approveBlockedReason}</Typography>}
                </>}
              </Stack>
            </>}
          </Stack>}
        </Box>
      </Stack>
      <Dialog open={missingPunchCheck != null} onClose={pending === 'punch' ? undefined : () => setMissingPunchCheck(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Add missing {missingPunchCheck?.code === 'MISSING_CLOCK_IN' ? 'clock-in' : 'clock-out'} time</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={0.5}>
            <Typography variant="body2" color="text.secondary">
              This adds a manager-entered time. The worker's original attendance record isn't changed or deleted.
            </Typography>
            <TextField
              type="datetime-local"
              label="Actual time"
              InputLabelProps={{ shrink: true }}
              value={missingPunchAt}
              onChange={(e) => setMissingPunchAt(e.target.value)}
              disabled={pending === 'punch'}
            />
            <TextField label="Reason" required helperText="Required, e.g. confirmed with the worker by phone." multiline minRows={2} value={missingPunchReason} onChange={(e) => setMissingPunchReason(e.target.value)} disabled={pending === 'punch'} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setMissingPunchCheck(null)} disabled={pending === 'punch'}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!timesheetId || !missingPunchCheck || !missingPunchAt || !missingPunchReason.trim() || pending === 'punch'}
            startIcon={spin('punch')}
            onClick={() => {
              if (!timesheetId || !missingPunchCheck) return;
              const sessionId = Number((missingPunchCheck.details as any)?.session_id);
              const eventType = missingPunchCheck.code === 'MISSING_CLOCK_IN' ? 'CLOCK_IN' : 'CLOCK_OUT';
              void run('punch', async () => {
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
          >Save time</Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
}
