import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import dayjs from 'dayjs';
import { fetchRosterWorkspace } from './api';
import type { RosterWorkspaceResponse } from './types';

export default function RosterCoveragePanel({ pharmacyId, calendarDate, refreshKey = 0 }: { pharmacyId: number | null; calendarDate: Date; refreshKey?: number }) {
  const [data, setData] = useState<RosterWorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const weekStart = dayjs(calendarDate).startOf('week').add(1, 'day').format('YYYY-MM-DD');

  const load = useCallback(async () => {
    if (!pharmacyId) return;
    setLoading(true);
    setError('');
    try { setData(await fetchRosterWorkspace(pharmacyId, weekStart)); }
    catch (err: any) { setError(err?.response?.data?.error || err?.message || 'Unable to load coverage.'); }
    finally { setLoading(false); }
  }, [pharmacyId, weekStart]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  if (!pharmacyId) return null;
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Typography fontWeight={900}>Coverage & revision</Typography>
          {loading && <CircularProgress size={18} />}
          {data && <>
            <Chip size="small" label={`Draft r${data.draft_revision}`} />
            <Chip size="small" label={`Published r${data.published_revision}`} variant="outlined" />
            <Chip size="small" color={data.validation.errors.length ? 'error' : 'success'} label={`${data.validation.errors.length} errors`} />
            <Chip size="small" color={data.validation.warnings.length ? 'warning' : 'success'} variant="outlined" label={`${data.validation.warnings.length} warnings`} />
            <Chip size="small" color={data.summary.coverage_shortfalls ? 'warning' : 'success'} label={`${data.summary.coverage_shortfalls} coverage gaps`} />
          </>}
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        {data?.coverage_view?.length ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, 1fr)' }, gap: 1 }}>
            {data.coverage_view.map((row) => (
              <Box key={`${row.requirement_id}-${row.date}`} sx={{ border: '1px solid #E5EAF2', borderRadius: 2, p: 1.25, bgcolor: row.is_covered ? '#F6FFF9' : '#FFF8E8' }}>
                <Typography variant="caption" color="text.secondary">{dayjs(row.date).format('ddd D MMM')} · {row.start_time}–{row.end_time}</Typography>
                <Typography fontWeight={800}>{row.role.replaceAll('_', ' ')}</Typography>
                <Typography variant="body2">Scheduled {row.scheduled_staff} / required {row.minimum_staff}{row.shortfall ? ` · short ${row.shortfall}` : ''}</Typography>
              </Box>
            ))}
          </Box>
        ) : <Typography variant="body2" color="text.secondary">No coverage requirements configured. This does not mean staffing is clinically sufficient; it only means no explicit coverage rules have been entered.</Typography>}
      </Stack>
    </Paper>
  );
}
