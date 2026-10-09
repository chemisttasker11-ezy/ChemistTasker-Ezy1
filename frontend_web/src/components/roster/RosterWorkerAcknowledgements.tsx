import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import moment from 'moment';
import { rosterV2 } from '@chemisttasker/shared-core';

type ShiftRow = {
  period_id: number | null;
  pharmacy_id: number;
  slot_date: string;
  is_acknowledged: boolean;
  can_acknowledge: boolean;
};
type WorkerRosterResponse = { shifts: ShiftRow[]; total_shifts: number };
type PeriodSummary = { periodId: number; shiftCount: number; acknowledged: boolean; canAcknowledge: boolean };

export default function RosterWorkerAcknowledgements({
  pharmacyId,
  calendarDate,
}: {
  pharmacyId: number | null;
  calendarDate: Date;
}) {
  const [periods, setPeriods] = useState<PeriodSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyPeriodId, setBusyPeriodId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const requestId = useRef(0);
  const monday = moment(calendarDate).startOf('isoWeek');
  const startDate = monday.format('YYYY-MM-DD');
  const endDate = monday.clone().add(6, 'days').format('YYYY-MM-DD');

  const reload = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setPeriods([]);
    if (!pharmacyId) return;
    setError(null);
    setLoading(true);
    try {
      // The established V2 worker endpoint only returns published assignments.
      const response = await rosterV2.getWorkerRoster({ start_date: startDate, end_date: endDate }) as WorkerRosterResponse;
      if (currentRequest !== requestId.current) return;
      const byPeriod = new Map<number, PeriodSummary>();
      for (const row of Array.isArray(response?.shifts) ? response.shifts : []) {
        if (Number(row.pharmacy_id) !== pharmacyId || !row.period_id) continue;
        const existing = byPeriod.get(row.period_id);
        if (existing) {
          existing.shiftCount++;
          existing.acknowledged = existing.acknowledged && row.is_acknowledged;
          existing.canAcknowledge = existing.canAcknowledge && row.can_acknowledge === true;
        } else {
          byPeriod.set(row.period_id, { periodId: row.period_id, shiftCount: 1, acknowledged: Boolean(row.is_acknowledged), canAcknowledge: row.can_acknowledge === true });
        }
      }
      setPeriods([...byPeriod.values()]);
    } catch (err: any) {
      if (currentRequest === requestId.current) {
        setError(err?.response?.data?.error || err?.message || 'Unable to check published roster acknowledgements.');
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [pharmacyId, startDate, endDate]);

  useEffect(() => {
    void reload();
    return () => { requestId.current++; };
  }, [reload, refreshToken]);

  const acknowledge = async (periodId: number) => {
    if (busyPeriodId !== null || !periods.some((period) => period.periodId === periodId && period.canAcknowledge && !period.acknowledged)) return;
    setBusyPeriodId(periodId);
    setError(null);
    try {
      await rosterV2.acknowledge({ period_id: periodId, notes: '' });
      setPeriods((current) => current.map((period) => period.periodId === periodId ? { ...period, acknowledged: true } : period));
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to acknowledge this roster.');
    } finally {
      setBusyPeriodId(null);
    }
  };

  if (!pharmacyId) return null;
  if (!loading && !error && periods.length === 0) return null;

  return (
    <Paper component="section" aria-label="Published roster acknowledgements" variant="outlined"
      sx={{ mb: 2.5, p: { xs: 1.75, sm: 2.25 }, borderColor: '#DCE5F1', borderRadius: '13px', boxShadow: 'none', bgcolor: '#FFFFFF' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1.5}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <FactCheckOutlinedIcon sx={{ fontSize: 21, color: '#5222B8' }} />
            <Typography component="h2" sx={{ color: '#06123A', fontWeight: 800, fontSize: 16 }}>Published roster acknowledgement</Typography>
          </Stack>
          <Typography sx={{ color: '#445474', fontSize: 13.5, lineHeight: 1.5, mt: 0.5 }}>
            Confirm you have seen the published shifts. Leave and cover requests remain separate.
          </Typography>
        </Box>
        {loading && <CircularProgress size={20} aria-label="Checking published rosters" />}
      </Stack>
      {periods.map((period) => (
        <Stack key={period.periodId} direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1.5}
          sx={{ pt: 1.5, mt: 1.5, borderTop: '1px solid #E5EBF3' }}>
          <Box>
            <Typography sx={{ color: '#06123A', fontSize: 14, fontWeight: 750 }}>
              {period.shiftCount} published {period.shiftCount === 1 ? 'shift' : 'shifts'} this week
            </Typography>
            <Chip size="small" label={period.acknowledged ? 'Acknowledged' : period.canAcknowledge ? 'Acknowledgement pending' : 'Archived roster'}
              sx={{ mt: 0.75, bgcolor: period.acknowledged ? '#E9F8F0' : '#FFF3DF', color: period.acknowledged ? '#075B43' : '#7B4800', fontWeight: 800 }} />
          </Box>
          {period.acknowledged ? (
            <Stack direction="row" spacing={0.8} alignItems="center">
              <CheckCircleOutlineRoundedIcon sx={{ color: '#075B43', fontSize: 19 }} />
              <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: '#075B43' }}>Confirmed received</Typography>
            </Stack>
          ) : period.canAcknowledge ? (
            <Button variant="contained" disabled={busyPeriodId !== null}
              onClick={() => void acknowledge(period.periodId)}
              sx={{ minHeight: 44, borderRadius: '9px', fontWeight: 800, bgcolor: '#5222B8', textTransform: 'none', '&:hover': { bgcolor: '#40168F' } }}>
              {busyPeriodId === period.periodId ? 'Acknowledging…' : 'Acknowledge roster'}
            </Button>
          ) : (
            <Typography sx={{ color: '#445474', fontSize: 13, fontWeight: 750 }}>Read-only archive</Typography>
          )}
        </Stack>
      ))}
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }} action={
          <Button onClick={() => setRefreshToken((value) => value + 1)} color="inherit" size="small" sx={{ minHeight: 44, fontWeight: 800 }}>Retry</Button>
        }>{error}</Alert>
      )}
    </Paper>
  );
}
