import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { fetchMyHours, submitMyTimesheet } from './api';
import TimesheetDetailDrawer from './TimesheetDetailDrawer';
import type { TimesheetRow } from './types';

const hours = (minutes: number | null | undefined) => minutes == null ? '—' : `${(minutes / 60).toFixed(2)} h`;
type MyHoursRow = TimesheetRow & { pharmacy: { id: number; name: string }; start_date: string; end_date: string };

export default function MyHoursPage() {
  const [rows, setRows] = useState<MyHoursRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await fetchMyHours());
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to load your hours.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const submit = async (row: MyHoursRow) => {
    if (!row.revision_number) return;
    setLoading(true);
    try {
      await submitMyTimesheet(row.id, row.revision_number);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to submit timesheet.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" fontWeight={900} color="#06214A">My Hours</Typography>
          <Typography color="text.secondary">Compare your roster with captured attendance, review checks, and ask your manager to correct source attendance if something is wrong.</Typography>
        </Box>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        {loading && <CircularProgress size={28} />}
        {!loading && rows.length === 0 && <Alert severity="info">No timesheet periods are available yet.</Alert>}
        {rows.map((row) => (
          <Paper key={row.id} variant="outlined" sx={{ p: 2.25, borderRadius: 3 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
              <Box flex={1}>
                <Typography fontWeight={900}>{row.pharmacy.name}</Typography>
                <Typography variant="body2" color="text.secondary">{row.start_date} – {row.end_date}</Typography>
                <Stack direction="row" spacing={1} mt={1} flexWrap="wrap">
                  <Chip size="small" label={row.status.replaceAll('_', ' ')} />
                  {row.blocking_checks > 0 && <Chip size="small" color="error" label={`${row.blocking_checks} blocking check${row.blocking_checks === 1 ? '' : 's'}`} />}
                  {row.warning_checks > 0 && <Chip size="small" color="warning" variant="outlined" label={`${row.warning_checks} warning${row.warning_checks === 1 ? '' : 's'}`} />}
                </Stack>
              </Box>
              <Stack direction="row" spacing={2}>
                <Box><Typography variant="caption" color="text.secondary">Rostered</Typography><Typography fontWeight={900}>{hours(row.rostered_minutes)}</Typography></Box>
                <Box><Typography variant="caption" color="text.secondary">Worked</Typography><Typography fontWeight={900}>{hours(row.worked_minutes)}</Typography></Box>
                <Box><Typography variant="caption" color="text.secondary">Reviewed</Typography><Typography fontWeight={900}>{hours(row.reviewed_minutes)}</Typography></Box>
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" onClick={() => setSelectedId(row.id)}>Review details</Button>
                <Button variant="contained" disabled={!row.revision_number || row.needs_rebuild || row.status === 'SUBMITTED' || row.status === 'APPROVED'} onClick={() => submit(row)}>Submit reviewed hours</Button>
              </Stack>
            </Stack>
          </Paper>
        ))}
      </Stack>
      <TimesheetDetailDrawer open={selectedId != null} timesheetId={selectedId} managerMode={false} onClose={() => setSelectedId(null)} onChanged={() => { void load(); }} />
    </Container>
  );
}
