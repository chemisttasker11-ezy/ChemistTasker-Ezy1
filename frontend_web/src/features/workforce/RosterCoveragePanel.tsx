import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Collapse, Paper, Stack, Typography } from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import dayjs from 'dayjs';
import { fetchRosterWorkspace } from './api';
import type { RosterWorkspaceResponse } from './types';

export default function RosterCoveragePanel({ pharmacyId, calendarDate, refreshKey = 0 }: { pharmacyId: number | null; calendarDate: Date; refreshKey?: number }) {
  const [data, setData] = useState<RosterWorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  // Use ISO Monday. startOf('week') + one day incorrectly selects NEXT week on Sundays.
  const date = dayjs(calendarDate);
  const weekStart = date.subtract((date.day() + 6) % 7, 'day').format('YYYY-MM-DD');

  const load = useCallback(async () => {
    const id = ++requestId.current;
    if (!pharmacyId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setData(null);
    setError('');
    try {
      const result = await fetchRosterWorkspace(pharmacyId, weekStart);
      if (id === requestId.current) setData(result);
    } catch (err: any) {
      if (id === requestId.current) setError(err?.response?.data?.error || err?.message || 'Unable to load coverage checks.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [pharmacyId, weekStart]);

  useEffect(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [load, refreshKey]);

  if (!pharmacyId) return null;
  const errorCount = data?.validation.errors.length ?? 0;
  const warningCount = data?.validation.warnings.length ?? 0;
  const gaps = data?.summary.coverage_shortfalls ?? 0;
  const hasRules = Boolean(data?.coverage_view.length);
  const requiresAttention = errorCount > 0 || warningCount > 0 || gaps > 0;

  return (
    <Paper component="section" aria-label="Weekly coverage and validation" variant="outlined" sx={{
      p: { xs: 2, md: 2.5 }, borderRadius: '14px', borderColor: '#DCE4EF',
      bgcolor: '#FFFFFF', mb: 2.25, boxShadow: 'none',
    }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={1.5}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" gap={1.25} alignItems="center">
            <Typography component="h2" sx={{ fontFamily: 'Outfit, sans-serif', fontWeight: 750, fontSize: 20, color: '#06123A' }}>
              Coverage and validation
            </Typography>
            {loading && <CircularProgress size={18} aria-label="Loading coverage checks" />}
          </Stack>
          <Typography sx={{ mt: 0.4, fontSize: 13.5, lineHeight: 1.5, color: '#445474' }}>
            {error ? 'Unable to verify this week.' : !data ? 'Checking the current roster…' : requiresAttention ? 'Review issues before publishing.' : hasRules ? 'No flagged issues under configured coverage rules.' : 'No coverage rules have been configured.'}
          </Typography>
        </Box>
        <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
          {data && (
            <Chip size="small" label={data.status === 'PUBLISHED' ? 'Published' : 'Draft'} sx={{ bgcolor: data.status === 'PUBLISHED' ? '#E9F7EF' : '#FFF2D8', color: data.status === 'PUBLISHED' ? '#075B43' : '#7B4800', fontWeight: 800 }} />
          )}
          <Button onClick={() => setExpanded((value) => !value)} disabled={!data} endIcon={expanded ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
            aria-expanded={expanded} aria-controls="roster-coverage-details"
            sx={{ color: '#5222B8', textTransform: 'none', fontWeight: 800, minHeight: 44 }}>
            {expanded ? 'Hide details' : 'View checks'}
          </Button>
        </Stack>
      </Stack>
      {data && (
        <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} sx={{ mt: 2 }} aria-label="Validation outcomes">
          <Chip size="small" label={errorCount + ' validation errors'} sx={{ bgcolor: errorCount ? '#FCE8E9' : '#EFF7F2', color: errorCount ? '#9E2838' : '#075B43', fontWeight: 800 }} />
          <Chip size="small" label={warningCount + ' warnings'} sx={{ bgcolor: warningCount ? '#FFF3DF' : '#F4F6FA', color: warningCount ? '#7B4800' : '#445474', fontWeight: 800 }} />
          <Chip size="small" label={gaps + ' coverage shortfalls'} sx={{ bgcolor: gaps ? '#FFF3DF' : '#F4F6FA', color: gaps ? '#7B4800' : '#445474', fontWeight: 800 }} />
          <Chip size="small" variant="outlined" label={'Draft r' + data.draft_revision + ' · published r' + data.published_revision} sx={{ color: '#445474', borderColor: '#DDE5F1' }} />
        </Stack>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }} action={
          <Button size="small" onClick={() => void load()} color="inherit" startIcon={<ReplayRoundedIcon />} sx={{ minHeight: 44, fontWeight: 800 }}>Retry</Button>
        }>{error}</Alert>
      )}
      <Collapse in={expanded} unmountOnExit>
        <Box id="roster-coverage-details" sx={{ mt: 2, borderTop: '1px solid #E5EAF2', pt: 2 }}>
          {data?.validation.errors.map((item, index) => (
            <Alert key={'err-' + index} severity="error" sx={{ mb: 1 }}>{item.message}</Alert>
          ))}
          {data?.validation.warnings.map((item, index) => (
            <Alert key={'warn-' + index} severity="warning" sx={{ mb: 1 }}>{item.message}</Alert>
          ))}
          {hasRules ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'repeat(2,minmax(0,1fr))', xl: 'repeat(3,minmax(0,1fr))' }, gap: 1.25 }}>
              {data!.coverage_view.map((row) => (
                <Box key={row.requirement_id + '-' + row.date} sx={{
                  border: '1px solid ' + (row.is_covered ? '#CFE7DA' : '#F1D7A9'),
                  borderRadius: '10px', p: 1.75, bgcolor: row.is_covered ? '#F6FBF8' : '#FFF9ED',
                }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#445474' }}>{dayjs(row.date).format('ddd D MMM')} · {row.start_time}–{row.end_time}</Typography>
                  <Typography sx={{ mt: 0.5, color: '#06123A', fontSize: 15, fontWeight: 800 }}>{row.role.replaceAll('_', ' ')}</Typography>
                  <Typography sx={{ mt: 0.4, color: '#344563', fontSize: 13.5 }}>
                    {row.scheduled_staff} scheduled / {row.minimum_staff} required
                    {row.shortfall > 0 ? ' · ' + row.shortfall + ' short' : ' · covered'}
                  </Typography>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography sx={{ fontSize: 13.5, lineHeight: 1.6, color: '#445474' }}>
              No coverage requirements configured. This does not establish that staffing is clinically sufficient.
            </Typography>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}
