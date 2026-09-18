import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import dayjs from 'dayjs';
import { fetchPharmaciesService } from '@chemisttasker/shared-core';
import {
  fetchTimesheetSummary,
  listTimesheetPeriods,
  listTimesheets,
  lockTimesheetPeriod,
  openTimesheetPeriod,
  recalculateTimesheetPeriod,
} from './api';
import TimesheetDetailDrawer from './TimesheetDetailDrawer';
import TimesheetHealthBanners from './TimesheetHealthBanners';
import type { TimesheetPeriod, TimesheetRow, TimesheetSummary } from './types';

const hours = (minutes: number | null | undefined) => minutes == null ? '—' : `${(minutes / 60).toFixed(2)} h`;

function statusColor(status: string): 'default' | 'success' | 'warning' | 'error' | 'info' {
  if (status === 'APPROVED' || status === 'READY') return 'success';
  if (status === 'NEEDS_REVIEW' || status === 'REOPENED') return 'warning';
  if (status === 'SUBMITTED') return 'info';
  return 'default';
}

function periodLabel(period: TimesheetPeriod) {
  return `${dayjs(period.start_date).format('D MMM')} – ${dayjs(period.end_date).format('D MMM YYYY')} · ${period.status}`;
}

export default function TimesheetsPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialPharmacy = Number(params.get('pharmacy_id') || params.get('pharmacy') || '') || null;
  const [pharmacies, setPharmacies] = useState<Array<{ id: number; name: string }>>([]);
  const [pharmacyId, setPharmacyId] = useState<number | null>(initialPharmacy);
  const [periods, setPeriods] = useState<TimesheetPeriod[]>([]);
  const [periodId, setPeriodId] = useState<number | null>(null);
  const [summary, setSummary] = useState<TimesheetSummary | null>(null);
  const [rows, setRows] = useState<TimesheetRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedTimesheetId, setSelectedTimesheetId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let active = true;
    fetchPharmaciesService({}).then((data: any[]) => {
      if (!active) return;
      const mapped = (data || []).map((row: any) => ({ id: Number(row.id), name: row.name || `Pharmacy #${row.id}` }));
      setPharmacies(mapped);
      if (!pharmacyId && mapped.length) setPharmacyId(mapped[0].id);
    }).catch((err: any) => setError(err?.message || 'Unable to load pharmacies.'));
    return () => { active = false; };
  }, []);

  const loadPeriods = useCallback(async () => {
    if (!pharmacyId) return;
    setLoading(true);
    setError('');
    try {
      const next = await listTimesheetPeriods(pharmacyId);
      setPeriods(next);
      setPeriodId((current) => current && next.some((row) => row.id === current) ? current : (next[0]?.id ?? null));
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to load timesheet periods.');
    } finally {
      setLoading(false);
    }
  }, [pharmacyId]);

  useEffect(() => { void loadPeriods(); }, [loadPeriods]);

  const loadPeriod = useCallback(async () => {
    if (!periodId) {
      setSummary(null);
      setRows([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [nextSummary, nextRows] = await Promise.all([
        fetchTimesheetSummary(periodId),
        listTimesheets(periodId, { status: statusFilter || undefined, search: search.trim() || undefined }),
      ]);
      setSummary(nextSummary);
      setRows(nextRows);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to load timesheets.');
    } finally {
      setLoading(false);
    }
  }, [periodId, search, statusFilter]);

  useEffect(() => {
    const handle = window.setTimeout(() => { void loadPeriod(); }, 180);
    return () => window.clearTimeout(handle);
  }, [loadPeriod]);

  const createCurrentFortnight = async () => {
    if (!pharmacyId) return;
    const today = dayjs();
    const monday = today.startOf('week').add(1, 'day');
    const start = today.day() === 0 ? monday.subtract(7, 'day') : monday;
    const end = start.add(13, 'day');
    setActionLoading(true);
    setError('');
    try {
      const opened = await openTimesheetPeriod(pharmacyId, start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD'));
      await loadPeriods();
      setPeriodId(opened.id);
      setFeedback(opened.created ? 'Timesheet period opened.' : 'Existing timesheet period selected.');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to open the period.');
    } finally {
      setActionLoading(false);
    }
  };

  const recalculate = async () => {
    if (!periodId) return;
    setActionLoading(true);
    setError('');
    try {
      await recalculateTimesheetPeriod(periodId, true);
      setFeedback('Timesheets recalculated from current roster, attendance, corrections and leave.');
      await loadPeriod();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to recalculate timesheets.');
    } finally {
      setActionLoading(false);
    }
  };

  const lock = async () => {
    if (!periodId) return;
    if (!window.confirm('Lock this reviewed period? Locked time is immutable; later corrections must use a later adjustment workflow.')) return;
    setActionLoading(true);
    setError('');
    try {
      const result = await lockTimesheetPeriod(periodId) as { manifest_hash?: string };
      setFeedback(`Period locked. Manifest ${String(result.manifest_hash || '').slice(0, 12)}… created for future integration.`);
      await loadPeriods();
      await loadPeriod();
    } catch (err: any) {
      const payload = err?.response?.data;
      setError(payload?.error || payload?.message || (payload ? JSON.stringify(payload) : err?.message) || 'Unable to lock period.');
    } finally {
      setActionLoading(false);
    }
  };

  const selectedPeriod = periods.find((row) => row.id === periodId) ?? null;

  return (
    <Container maxWidth={false} sx={{ py: { xs: 2, md: 3 } }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" fontWeight={900} color="#06214A">Timesheets</Typography>
          <Typography color="text.secondary">Review rostered versus actual time, resolve exceptions, and approve a specific revision before any future payroll handoff.</Typography>
        </Box>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ lg: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel>Pharmacy</InputLabel>
              <Select value={pharmacyId ?? ''} label="Pharmacy" onChange={(event) => { setPharmacyId(Number(event.target.value)); setPeriodId(null); }}>
                {pharmacies.map((row) => <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 270 }} disabled={!periods.length}>
              <InputLabel>Period</InputLabel>
              <Select value={periodId ?? ''} label="Period" onChange={(event) => setPeriodId(Number(event.target.value))}>
                {periods.map((row) => <MenuItem key={row.id} value={row.id}>{periodLabel(row)}</MenuItem>)}
              </Select>
            </FormControl>
            <Button variant="outlined" onClick={createCurrentFortnight} disabled={!pharmacyId || actionLoading}>Open current fortnight</Button>
            <Box flex={1} />
            <Button startIcon={<RefreshIcon />} onClick={recalculate} disabled={!periodId || actionLoading || selectedPeriod?.status === 'LOCKED'}>Recalculate</Button>
            <Button color="warning" startIcon={<LockOutlinedIcon />} variant="outlined" onClick={lock} disabled={!periodId || actionLoading || selectedPeriod?.status === 'LOCKED'}>Lock reviewed period</Button>
          </Stack>
        </Paper>

        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        {feedback && <Alert severity="success" onClose={() => setFeedback('')}>{feedback}</Alert>}
        {summary && <TimesheetHealthBanners summary={summary} />}

        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ p: 2, borderBottom: '1px solid #E5EAF2' }}>
            <TextField size="small" label="Search worker" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 260 }} />
            <FormControl size="small" sx={{ minWidth: 190 }}>
              <InputLabel>Status</InputLabel>
              <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(String(e.target.value))}>
                <MenuItem value="">All statuses</MenuItem>
                {['OPEN', 'NEEDS_REVIEW', 'READY', 'SUBMITTED', 'APPROVED', 'REOPENED'].map((value) => <MenuItem key={value} value={value}>{value.replaceAll('_', ' ')}</MenuItem>)}
              </Select>
            </FormControl>
            {loading && <CircularProgress size={24} sx={{ alignSelf: 'center' }} />}
          </Stack>

          <TableContainer>
            <Table size="small" sx={{ minWidth: 980 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Employee</TableCell>
                  <TableCell align="right">Rostered</TableCell>
                  <TableCell align="right">Contracted</TableCell>
                  <TableCell align="right">Worked</TableCell>
                  <TableCell align="right">Leave</TableCell>
                  <TableCell align="right">Reviewed</TableCell>
                  <TableCell>Checks</TableCell>
                  <TableCell align="right">Comments</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!loading && rows.length === 0 && <TableRow><TableCell colSpan={9}><Alert severity="info">No timesheets in this period yet. Recalculate the period after roster or attendance data exists.</Alert></TableCell></TableRow>}
                {rows.map((row) => (
                  <TableRow key={row.id} hover sx={{ cursor: 'pointer' }} onClick={() => setSelectedTimesheetId(row.id)}>
                    <TableCell><Typography fontWeight={800}>{row.worker.name}</Typography>{row.needs_rebuild && <Typography variant="caption" color="warning.main">Needs recalculation</Typography>}</TableCell>
                    <TableCell align="right">{hours(row.rostered_minutes)}</TableCell>
                    <TableCell align="right">{hours(row.contracted_minutes)}</TableCell>
                    <TableCell align="right">{hours(row.worked_minutes)}</TableCell>
                    <TableCell align="right">{hours(row.approved_leave_minutes)}</TableCell>
                    <TableCell align="right">{hours(row.reviewed_minutes)}</TableCell>
                    <TableCell><Stack direction="row" spacing={0.5}><Chip size="small" color={row.blocking_checks ? 'error' : 'success'} label={`${row.blocking_checks} blocking`} /><Chip size="small" color="warning" variant="outlined" label={`${row.warning_checks} warnings`} /></Stack></TableCell>
                    <TableCell align="right">{row.comments_count}</TableCell>
                    <TableCell><Chip size="small" color={statusColor(row.status)} label={row.status.replaceAll('_', ' ')} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Stack>

      <TimesheetDetailDrawer
        open={selectedTimesheetId != null}
        timesheetId={selectedTimesheetId}
        onClose={() => setSelectedTimesheetId(null)}
        onChanged={() => { void loadPeriod(); }}
      />
    </Container>
  );
}
