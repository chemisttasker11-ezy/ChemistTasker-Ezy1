import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { CalendarPlus, ChevronRight, ClipboardList, Lock, MessageSquare, RefreshCw, Search, Undo2 } from 'lucide-react';
import dayjs from 'dayjs';
import { fetchPharmaciesService } from '@chemisttasker/shared-core';
import PageHeader from '../../components/ui/PageHeader';
import DashboardContentState from '../../components/dashboard/DashboardContentState';
import { InitialsAvatar } from '../../components/ui/InitialsAvatar';
import { Pill } from '../../components/ui/Pill';
import {
  fetchTimesheetSummary,
  listTimesheetPeriods,
  listTimesheets,
  correctTimesheetPeriod,
  lockTimesheetPeriod,
  openTimesheetPeriod,
  recalculateTimesheetPeriod,
} from './api';
import TimesheetDetailDrawer from './TimesheetDetailDrawer';
import TimesheetHealthBanners from './TimesheetHealthBanners';
import { PERIOD_STATUS, TIMESHEET_STATUS, formatHours, plural, timesheetStatus } from './timesheetDisplay';
import type { TimesheetPeriod, TimesheetRow, TimesheetStatus, TimesheetSummary } from './types';

type Busy = '' | 'open' | 'recalculate' | 'lock' | 'correct';

const errorText = (err: any, fallback: string) => {
  const payload = err?.response?.data;
  return payload?.error || payload?.message || payload?.detail || err?.message || fallback;
};

const periodRange = (period: TimesheetPeriod) =>
  `${dayjs(period.start_date).format('D MMM')} – ${dayjs(period.end_date).format('D MMM YYYY')}`;

const sectionTitleSx = { fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 22, color: 'var(--ct-text-primary)' } as const;
const cardSx = { borderRadius: 'var(--ct-card-radius)', borderColor: 'var(--ct-border-color)', bgcolor: 'var(--ct-surface-bg)' } as const;

function TimesheetCard({ row, onOpen }: { row: TimesheetRow; onOpen: () => void }) {
  const status = timesheetStatus(row.status);
  return (
    <Paper variant="outlined" sx={{ ...cardSx, overflow: 'hidden' }}>
      <ButtonBase
        onClick={onOpen}
        aria-label={`Review ${row.worker.name}'s timesheet`}
        sx={{
          width: '100%',
          textAlign: 'left',
          p: { xs: 1.75, md: 2 },
          display: 'flex',
          alignItems: { xs: 'flex-start', md: 'center' },
          gap: 1.5,
          '&:hover': { bgcolor: 'var(--ct-subtle-bg)' },
          '&.Mui-focusVisible': { outline: '2px solid var(--ct-accent-strong)', outlineOffset: -2 },
        }}
      >
        <InitialsAvatar name={row.worker.name} size={40} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography component="h3" sx={{ fontWeight: 600, fontSize: 16, color: 'var(--ct-text-primary)', overflowWrap: 'anywhere' }}>
              {row.worker.name}
            </Typography>
            <Pill tone={status.tone} label={status.label} title={status.hint || undefined} />
            {row.needs_rebuild && <Pill tone="amber" label="Needs recalculating" title="Attendance, roster or leave changed since this was calculated." />}
          </Stack>
          <Typography variant="body2" sx={{ mt: 0.5, color: 'var(--ct-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
            Worked <Box component="strong" sx={{ color: 'var(--ct-text-primary)', fontWeight: 600 }}>{formatHours(row.worked_minutes)}</Box>
            {' · '}Rostered {formatHours(row.rostered_minutes)}
            {row.contracted_minutes != null && ` · Contracted ${formatHours(row.contracted_minutes)}`}
            {row.approved_leave_minutes > 0 && ` · Leave ${formatHours(row.approved_leave_minutes)}`}
            {' · '}Reviewed {formatHours(row.reviewed_minutes)}
          </Typography>
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
            {row.blocking_checks > 0 && <Pill tone="red" label={plural(row.blocking_checks, 'error')} title="Errors block approval." />}
            {row.warning_checks > 0 && <Pill tone="amber" label={plural(row.warning_checks, 'warning')} title="Resolve or waive with a reason." />}
            {row.blocking_checks === 0 && row.warning_checks === 0 && <Pill tone="green" label="No issues" />}
            {row.comments_count > 0 && (
              <Pill tone="neutral" icon={<MessageSquare />} label={plural(row.comments_count, 'comment')} />
            )}
          </Stack>
        </Box>
        <Box sx={{ color: 'var(--ct-text-muted)', display: 'flex', alignSelf: 'center' }} aria-hidden>
          <ChevronRight size={20} />
        </Box>
      </ButtonBase>
    </Paper>
  );
}

export default function TimesheetsPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialPharmacy = Number(params.get('pharmacy_id') || params.get('pharmacy') || '') || null;
  const [pharmacies, setPharmacies] = useState<Array<{ id: number; name: string }>>([]);
  const [pharmaciesState, setPharmaciesState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pharmacyId, setPharmacyId] = useState<number | null>(initialPharmacy);
  const [periods, setPeriods] = useState<TimesheetPeriod[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [periodsFailed, setPeriodsFailed] = useState(false);
  const [periodId, setPeriodId] = useState<number | null>(null);
  const [summary, setSummary] = useState<TimesheetSummary | null>(null);
  const [rows, setRows] = useState<TimesheetRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsFailed, setRowsFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedTimesheetId, setSelectedTimesheetId] = useState<number | null>(null);
  const [busy, setBusy] = useState<Busy>('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [lockOpen, setLockOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [correctReason, setCorrectReason] = useState('');

  const loadPharmacies = useCallback(() => {
    setPharmaciesState('loading');
    fetchPharmaciesService({}).then((data: any[]) => {
      const mapped = (data || []).map((row: any) => ({ id: Number(row.id), name: row.name || `Pharmacy #${row.id}` }));
      setPharmacies(mapped);
      setPharmacyId((current) => current ?? mapped[0]?.id ?? null);
      setPharmaciesState('ready');
    }).catch(() => setPharmaciesState('error'));
  }, []);

  useEffect(() => { loadPharmacies(); }, [loadPharmacies]);

  const loadPeriods = useCallback(async () => {
    if (!pharmacyId) return;
    setPeriodsLoading(true);
    setPeriodsFailed(false);
    try {
      const next = await listTimesheetPeriods(pharmacyId);
      setPeriods(next);
      setPeriodId((current) => current && next.some((row: TimesheetPeriod) => row.id === current) ? current : (next[0]?.id ?? null));
    } catch {
      setPeriodsFailed(true);
    } finally {
      setPeriodsLoading(false);
    }
  }, [pharmacyId]);

  useEffect(() => { void loadPeriods(); }, [loadPeriods]);

  const loadPeriod = useCallback(async () => {
    if (!periodId) {
      setSummary(null);
      setRows([]);
      return;
    }
    setRowsLoading(true);
    setRowsFailed(false);
    try {
      const [nextSummary, nextRows] = await Promise.all([
        fetchTimesheetSummary(periodId),
        listTimesheets(periodId, { status: statusFilter || undefined, search: search.trim() || undefined }),
      ]);
      setSummary(nextSummary);
      setRows(nextRows);
    } catch {
      setRowsFailed(true);
    } finally {
      setRowsLoading(false);
    }
  }, [periodId, search, statusFilter]);

  useEffect(() => {
    const handle = window.setTimeout(() => { void loadPeriod(); }, 180);
    return () => window.clearTimeout(handle);
  }, [loadPeriod]);

  const runAction = async (kind: Busy, action: () => Promise<void>, fallback: string) => {
    setBusy(kind);
    setError('');
    setFeedback('');
    try {
      await action();
    } catch (err: any) {
      setError(errorText(err, fallback));
    } finally {
      setBusy('');
    }
  };

  const createCurrentFortnight = () => {
    if (!pharmacyId) return;
    const today = dayjs();
    const monday = today.startOf('week').add(1, 'day');
    const start = today.day() === 0 ? monday.subtract(7, 'day') : monday;
    const end = start.add(13, 'day');
    void runAction('open', async () => {
      const opened = await openTimesheetPeriod(pharmacyId, start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD'));
      await loadPeriods();
      setPeriodId(opened.id);
      setFeedback(opened.created ? 'Timesheet period opened.' : 'This fortnight was already open, so it is now selected.');
    }, "We couldn't open the period.");
  };

  const recalculate = () => {
    if (!periodId) return;
    void runAction('recalculate', async () => {
      await recalculateTimesheetPeriod(periodId, true);
      setFeedback('Timesheets recalculated from attendance already received, roster, corrections and leave. Sync offline kiosks at the terminal to include pending events.');
      await loadPeriod();
    }, "We couldn't recalculate the timesheets.");
  };

  const lock = () => {
    if (!periodId) return;
    void runAction('lock', async () => {
      const result = await lockTimesheetPeriod(periodId) as { manifest_hash?: string };
      setLockOpen(false);
      const ref = String(result.manifest_hash || '').slice(0, 12);
      setFeedback(ref ? `Period locked. Record ${ref}… saved for audit.` : 'Period locked.');
      await loadPeriods();
      await loadPeriod();
    }, "We couldn't lock the period.");
  };

  const correct = () => {
    if (!periodId || !correctReason.trim()) return;
    void runAction('correct', async () => {
      await correctTimesheetPeriod(periodId, correctReason.trim());
      setCorrectOpen(false);
      setCorrectReason('');
      setFeedback('Period reopened for correction. Fix the affected timesheets, approve them and lock the period again.');
      await loadPeriods();
      await loadPeriod();
    }, "We couldn't reopen the period.");
  };

  const selectedPeriod = periods.find((row) => row.id === periodId) ?? null;
  const isLocked = selectedPeriod?.status === 'LOCKED';
  const filtersActive = Boolean(search.trim() || statusFilter);
  const working = busy !== '';
  const spinner = (kind: Busy, icon: ReactElement) => (busy === kind ? <CircularProgress size={16} color="inherit" /> : icon);

  const pharmacyPicker = pharmacies.length > 1 ? (
    <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 240 } }}>
      <InputLabel id="timesheets-pharmacy">Pharmacy</InputLabel>
      <Select
        labelId="timesheets-pharmacy"
        value={pharmacyId ?? ''}
        label="Pharmacy"
        onChange={(event) => { setPharmacyId(Number(event.target.value)); setPeriodId(null); setPeriods([]); }}
      >
        {pharmacies.map((row) => <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>)}
      </Select>
    </FormControl>
  ) : null;

  let content: ReactElement;
  if (pharmaciesState === 'loading') {
    content = <DashboardContentState kind="loading" title="Loading timesheets" />;
  } else if (pharmaciesState === 'error') {
    content = (
      <DashboardContentState kind="error" title="We couldn't load your pharmacies" description="Check your connection and try again." actionLabel="Try again" onAction={loadPharmacies} />
    );
  } else if (!pharmacyId) {
    content = (
      <DashboardContentState kind="empty" icon={<ClipboardList size={26} />} title="No pharmacies to manage" description="Timesheets appear here for pharmacies where you manage the roster." />
    );
  } else if (periodsLoading && periods.length === 0) {
    content = <DashboardContentState kind="loading" title="Loading timesheet periods" />;
  } else if (periodsFailed) {
    content = (
      <DashboardContentState kind="error" title="We couldn't load timesheet periods" description="Check your connection and try again." actionLabel="Try again" onAction={() => void loadPeriods()} />
    );
  } else if (periods.length === 0) {
    content = (
      <DashboardContentState
        kind="empty"
        icon={<CalendarPlus size={26} />}
        title="No timesheet periods yet"
        description="Open the current fortnight to start collecting rostered and worked hours."
        actionLabel={busy === 'open' ? 'Opening…' : 'Open current fortnight'}
        onAction={working ? undefined : createCurrentFortnight}
      />
    );
  } else {
    let list: ReactElement;
    if (rowsFailed) {
      list = <DashboardContentState compact kind="error" title="We couldn't load these timesheets" description="Check your connection and try again." actionLabel="Try again" onAction={() => void loadPeriod()} />;
    } else if (rowsLoading && rows.length === 0) {
      list = <DashboardContentState compact kind="loading" title="Loading timesheets" />;
    } else if (rows.length === 0 && filtersActive) {
      list = <DashboardContentState compact kind="empty" icon={<Search size={24} />} title="No timesheets match" description="Try another name or status." actionLabel="Clear filters" onAction={() => { setSearch(''); setStatusFilter(''); }} />;
    } else if (rows.length === 0) {
      list = <DashboardContentState compact kind="empty" icon={<ClipboardList size={24} />} title="No timesheets in this period yet" description="They appear when you recalculate after roster or attendance data exists for these dates." />;
    } else {
      list = (
        <Stack spacing={1.25} aria-busy={rowsLoading}>
          {rows.map((row) => <TimesheetCard key={row.id} row={row} onOpen={() => setSelectedTimesheetId(row.id)} />)}
        </Stack>
      );
    }

    const periodStatus = selectedPeriod ? PERIOD_STATUS[selectedPeriod.status] : null;
    content = (
      <Stack spacing={2.5}>
        <Paper variant="outlined" sx={{ ...cardSx, p: { xs: 1.75, md: 2 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} useFlexGap flexWrap="wrap">
            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
              <FormControl size="small" sx={{ minWidth: { xs: 0, sm: 240 }, flex: { xs: 1, sm: 'none' } }}>
                <InputLabel id="timesheets-period">Period</InputLabel>
                <Select
                  labelId="timesheets-period"
                  value={periodId ?? ''}
                  label="Period"
                  renderValue={(value) => { const match = periods.find((row) => row.id === value); return match ? periodRange(match) : ''; }}
                  onChange={(event) => setPeriodId(Number(event.target.value))}>
                  {periods.map((row) => <MenuItem key={row.id} value={row.id}>{periodRange(row)} · {PERIOD_STATUS[row.status]?.label ?? row.status}</MenuItem>)}
                </Select>
              </FormControl>
              {periodStatus && <Pill tone={periodStatus.tone} label={periodStatus.label} title={periodStatus.hint} />}
            </Stack>
            <Box sx={{ flex: 1, display: { xs: 'none', md: 'block' } }} />
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button variant="text" onClick={createCurrentFortnight} disabled={working} startIcon={spinner('open', <CalendarPlus size={16} />)} sx={{ minHeight: 40 }}>
                Open current fortnight
              </Button>
              {isLocked ? (
                <Tooltip title="Reopen this locked period to fix a mistake. The locked record is kept for audit.">
                  <span>
                    <Button variant="outlined" color="error" onClick={() => setCorrectOpen(true)} disabled={working} startIcon={<Undo2 size={16} />} sx={{ minHeight: 40 }}>
                      Correct period
                    </Button>
                  </span>
                </Tooltip>
              ) : (
                <>
                  <Tooltip title="Rebuild from attendance received, the roster, corrections and approved leave.">
                    <span>
                      <Button variant="outlined" onClick={recalculate} disabled={!periodId || working} startIcon={spinner('recalculate', <RefreshCw size={16} />)} sx={{ minHeight: 40 }}>
                        Recalculate
                      </Button>
                    </span>
                  </Tooltip>
                  <Tooltip title="Freeze reviewed time for payroll once every timesheet is approved.">
                    <span>
                      <Button variant="contained" onClick={() => setLockOpen(true)} disabled={!periodId || working} startIcon={<Lock size={16} />} sx={{ minHeight: 40 }}>
                        Lock period
                      </Button>
                    </span>
                  </Tooltip>
                </>
              )}
            </Stack>
          </Stack>
          {summary && <Box sx={{ mt: 1.75 }}><TimesheetHealthBanners summary={summary} /></Box>}
        </Paper>

        <Box component="section" aria-labelledby="timesheets-workers">
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} justifyContent="space-between" sx={{ mb: 1.5 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography id="timesheets-workers" component="h2" sx={sectionTitleSx}>Workers</Typography>
              {summary && summary.total_timesheets > 0 && <Pill tone="neutral" label={plural(summary.total_timesheets, 'timesheet')} />}
              {rowsLoading && rows.length > 0 && <CircularProgress size={16} aria-label="Updating" />}
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                size="small"
                label="Search worker"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ minWidth: { sm: 240 } }}
                InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }}
              />
              <FormControl size="small" sx={{ minWidth: { sm: 200 } }}>
                <InputLabel id="timesheets-status">Status</InputLabel>
                <Select labelId="timesheets-status" value={statusFilter} label="Status" onChange={(e) => setStatusFilter(String(e.target.value))}>
                  <MenuItem value="">All statuses</MenuItem>
                  {(Object.keys(TIMESHEET_STATUS) as TimesheetStatus[]).map((value) => (
                    <MenuItem key={value} value={value}>{TIMESHEET_STATUS[value].label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </Stack>
          {list}
        </Box>
      </Stack>
    );
  }

  return (
    <Box>
      <PageHeader
        title="Timesheets"
        subtitle="Compare rostered with worked hours, clear exceptions, approve each timesheet and lock the period."
        actions={pharmacyPicker}
      />

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
      {feedback && <Alert severity="success" onClose={() => setFeedback('')} sx={{ mb: 2 }}>{feedback}</Alert>}

      {content}

      <TimesheetDetailDrawer
        open={selectedTimesheetId != null}
        timesheetId={selectedTimesheetId}
        onClose={() => setSelectedTimesheetId(null)}
        onChanged={() => { void loadPeriod(); }}
      />

      <Dialog open={lockOpen} onClose={busy === 'lock' ? undefined : () => setLockOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Lock {selectedPeriod ? periodRange(selectedPeriod) : 'this period'}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Locked time is frozen for payroll. To change it later you'll need to correct the period, which keeps this locked record for audit.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setLockOpen(false)} disabled={busy === 'lock'}>Cancel</Button>
          <Button variant="contained" onClick={lock} disabled={busy === 'lock'} startIcon={spinner('lock', <Lock size={16} />)}>Lock period</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={correctOpen} onClose={busy === 'correct' ? undefined : () => setCorrectOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Correct {selectedPeriod ? periodRange(selectedPeriod) : 'this period'}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The period reopens so you can fix timesheets, approve them and lock it again. The current locked record is kept for audit.
          </Typography>
          <TextField
            label="Reason"
            required
            fullWidth
            multiline
            minRows={2}
            value={correctReason}
            onChange={(e) => setCorrectReason(e.target.value)}
            helperText="Required. Say what needs fixing, e.g. a missed clock-out on Tuesday."
            disabled={busy === 'correct'}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setCorrectOpen(false)} disabled={busy === 'correct'}>Cancel</Button>
          <Button variant="contained" color="error" onClick={correct} disabled={busy === 'correct' || !correctReason.trim()} startIcon={spinner('correct', <Undo2 size={16} />)}>
            Reopen for correction
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
