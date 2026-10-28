import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { attendance } from '@chemisttasker/shared-core';
import { correctionTimestamp } from '../../pages/attendance/correctionTimestamp';
import { recalculateTimesheet } from './api';

dayjs.extend(utc);
dayjs.extend(timezone);

const errorText = (error: any, fallback: string) => {
  const payload = error?.response?.data;
  return payload?.error || payload?.message || payload?.detail || error?.message || fallback;
};

const clockTime = (iso: string | null | undefined, timeZone?: string) => {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
};

type TimelineEvent = {
  event_id: number;
  event_type: string;
  original_timestamp: string;
  effective_timestamp: string;
  is_corrected: boolean;
  correction_id: number | null;
  correction_reason: string | null;
};

type SessionTimelineData = {
  session_id: number;
  pharmacy_id: number;
  pharmacy_name: string;
  pharmacy_timezone: string;
  worker_id: number;
  worker_name: string;
  is_provisional: boolean;
  timeline: TimelineEvent[];
};

export interface TimesheetAdjustTimesDay {
  date: string;
  session_id?: number | null;
  assignment_id?: number | null;
  rostered_start?: string | null;
  rostered_end?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  recorded_break_minutes?: number | null;
  planned_break_minutes?: number | null;
  worked_minutes?: number | null;
}

export interface TimesheetAdjustTimesDialogProps {
  open: boolean;
  onClose: () => void;
  timesheetId: number;
  sessionId: number;
  day: TimesheetAdjustTimesDay;
  timeZone?: string;
  readOnly?: boolean;
  onSaved: () => Promise<void> | void;
}

export default function TimesheetAdjustTimesDialog({
  open,
  onClose,
  timesheetId,
  sessionId,
  day,
  timeZone,
  readOnly = false,
  onSaved,
}: TimesheetAdjustTimesDialogProps) {
  const [timelineData, setTimelineData] = useState<SessionTimelineData | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [finishLocal, setFinishLocal] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const pharmacyTimezone = timelineData?.pharmacy_timezone || timeZone || 'Australia/Sydney';

  const startEvent = useMemo(
    () => timelineData?.timeline.find((e) => e.event_type === 'CLOCK_IN'),
    [timelineData]
  );
  const finishEvent = useMemo(
    () => timelineData?.timeline.find((e) => e.event_type === 'CLOCK_OUT'),
    [timelineData]
  );
  const breakEvents = useMemo(
    () => timelineData?.timeline.filter((e) => e.event_type !== 'CLOCK_IN' && e.event_type !== 'CLOCK_OUT') ?? [],
    [timelineData]
  );

  const fetchTimeline = useCallback(async () => {
    if (!sessionId) return false;
    setLoadingTimeline(true);
    setLoadError('');
    setSaveError('');
    try {
      const data = (await attendance.getManagerTimeline(sessionId)) as SessionTimelineData;
      setTimelineData(data);
      const tz = data.pharmacy_timezone || timeZone || 'Australia/Sydney';

      const startEv = data.timeline.find((e) => e.event_type === 'CLOCK_IN');
      const finishEv = data.timeline.find((e) => e.event_type === 'CLOCK_OUT');

      if (startEv) {
        setStartLocal(dayjs(startEv.effective_timestamp).tz(tz).format('YYYY-MM-DDTHH:mm'));
      } else {
        setStartLocal('');
      }

      if (finishEv) {
        setFinishLocal(dayjs(finishEv.effective_timestamp).tz(tz).format('YYYY-MM-DDTHH:mm'));
      } else {
        setFinishLocal('');
      }
      return true;
    } catch (err: any) {
      setTimelineData(null);
      setLoadError(errorText(err, "We couldn't load clock times for this session."));
      return false;
    } finally {
      setLoadingTimeline(false);
    }
  }, [sessionId, timeZone]);

  useEffect(() => {
    if (open) {
      setReason('');
      setSaveError('');
      void fetchTimeline();
    }
  }, [open, fetchTimeline]);

  const hasRosteredTimes = Boolean(day.rostered_start && day.rostered_end);

  const handleUseRosteredTimes = () => {
    if (!day.rostered_start || !day.rostered_end) return;
    setStartLocal(dayjs(day.rostered_start).tz(pharmacyTimezone).format('YYYY-MM-DDTHH:mm'));
    setFinishLocal(dayjs(day.rostered_end).tz(pharmacyTimezone).format('YYYY-MM-DDTHH:mm'));
    setSaveError('');
  };

  const origStartLocal = startEvent
    ? dayjs(startEvent.effective_timestamp).tz(pharmacyTimezone).format('YYYY-MM-DDTHH:mm')
    : '';
  const origFinishLocal = finishEvent
    ? dayjs(finishEvent.effective_timestamp).tz(pharmacyTimezone).format('YYYY-MM-DDTHH:mm')
    : '';

  const startChanged = Boolean(startEvent && startLocal && startLocal !== origStartLocal);
  const finishChanged = Boolean(finishEvent && finishLocal && finishLocal !== origFinishLocal);
  const hasChanges = startChanged || finishChanged;

  // Validation
  const validationError = useMemo(() => {
    if (!timelineData) return '';
    if (!startEvent && !finishEvent) {
      return 'No clock events found for this session. Use "Add missing clock time" in Checks to record punches.';
    }
    if (startEvent && !startLocal) {
      return 'Start time is required.';
    }
    if (finishEvent && !finishLocal) {
      return 'Finish time is required.';
    }

    if (startLocal && finishLocal) {
      const startDayjs = dayjs.tz(startLocal, pharmacyTimezone);
      const finishDayjs = dayjs.tz(finishLocal, pharmacyTimezone);

      if (!finishDayjs.isAfter(startDayjs)) {
        return 'Start time must be before finish time.';
      }

      const now = dayjs();
      if (startDayjs.isAfter(now) || finishDayjs.isAfter(now)) {
        return 'Adjusted times cannot be in the future.';
      }

      if (breakEvents.length > 0) {
        for (const b of breakEvents) {
          const bTime = dayjs(b.effective_timestamp).valueOf();
          if (startDayjs.valueOf() > bTime) {
            return 'Start time must be before recorded breaks.';
          }
          if (finishDayjs.valueOf() < bTime) {
            return 'Finish time must be after recorded breaks.';
          }
        }
      }
    }

    return '';
  }, [timelineData, startEvent, finishEvent, startLocal, finishLocal, pharmacyTimezone, breakEvents]);

  const handleSave = async () => {
    if (readOnly || saving || loadingTimeline || !timelineData || loadError || !reason.trim() || !hasChanges || validationError) return;
    setSaving(true);
    setSaveError('');

    try {
      const targetStartIso = startChanged && startEvent
        ? correctionTimestamp(startLocal, startEvent.effective_timestamp, pharmacyTimezone)
        : null;
      const targetFinishIso = finishChanged && finishEvent
        ? correctionTimestamp(finishLocal, finishEvent.effective_timestamp, pharmacyTimezone)
        : null;

      if (targetStartIso && targetFinishIso && startEvent && finishEvent) {
        const targetStartMs = dayjs(targetStartIso).valueOf();
        const targetFinishMs = dayjs(targetFinishIso).valueOf();
        const origFinishMs = dayjs(finishEvent.effective_timestamp).valueOf();

        const finishFirst = targetStartMs >= origFinishMs || targetFinishMs > origFinishMs;

        if (finishFirst) {
          await attendance.correct(finishEvent.event_id, targetFinishIso, reason.trim());
          try {
            await attendance.correct(startEvent.event_id, targetStartIso, reason.trim());
          } catch (err: any) {
            // Partial failure: finish succeeded, start failed
            await fetchTimeline();
            try {
              await recalculateTimesheet(timesheetId);
              await onSaved();
            } catch {
              // ignore secondary errors during recovery
            }
            setSaveError(
              `Saved finish time, but failed to save start time: ${errorText(err, 'Server error')}. Please check and try again.`
            );
            setSaving(false);
            return;
          }
        } else {
          await attendance.correct(startEvent.event_id, targetStartIso, reason.trim());
          try {
            await attendance.correct(finishEvent.event_id, targetFinishIso, reason.trim());
          } catch (err: any) {
            // Partial failure: start succeeded, finish failed
            await fetchTimeline();
            try {
              await recalculateTimesheet(timesheetId);
              await onSaved();
            } catch {
              // ignore secondary errors during recovery
            }
            setSaveError(
              `Saved start time, but failed to save finish time: ${errorText(err, 'Server error')}. Please check and try again.`
            );
            setSaving(false);
            return;
          }
        }
      } else if (targetStartIso && startEvent) {
        await attendance.correct(startEvent.event_id, targetStartIso, reason.trim());
      } else if (targetFinishIso && finishEvent) {
        await attendance.correct(finishEvent.event_id, targetFinishIso, reason.trim());
      }

      // Saved corrections must become the retry baseline even if recalculation fails.
      const refreshed = await fetchTimeline();

      // Explicitly recalculate timesheet so the hours and revision update
      try {
        await recalculateTimesheet(timesheetId);
      } catch (recalcErr: any) {
        await onSaved();
        setSaveError(
          `Adjustments were saved, but timesheet recalculation failed: ${errorText(recalcErr, 'Server error')}. Please click Recalculate in the drawer.`
        );
        setSaving(false);
        return;
      }

      await onSaved();
      if (refreshed) onClose();
    } catch (err: any) {
      setSaveError(errorText(err, 'Failed to save adjustments.'));
    } finally {
      setSaving(false);
    }
  };

  const dayDateLabel = dayjs(day.date).format('dddd D MMM');

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Adjust times · {dayDateLabel}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Adjust attendance start and finish times. Original clock records are kept for audit and disputes.
          </Typography>

          {loadError && (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={() => void fetchTimeline()}>
                  Retry
                </Button>
              }
            >
              {loadError}
            </Alert>
          )}

          {saveError && (
            <Alert severity="error" onClose={() => setSaveError('')}>
              {saveError}
            </Alert>
          )}

          {loadingTimeline && !timelineData ? (
            <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center" sx={{ py: 3 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                Loading clock times…
              </Typography>
            </Stack>
          ) : (
            <>
              {/* Rostered shortcut */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 1.5,
                  p: 1.5,
                  bgcolor: 'var(--ct-subtle-bg, #f8fafc)',
                  borderRadius: '10px',
                  border: '1px solid var(--ct-border-color, #e2e8f0)',
                }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--ct-text-primary)' }}>
                    Rostered shift
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {hasRosteredTimes
                      ? `${clockTime(day.rostered_start, pharmacyTimezone)} – ${clockTime(day.rostered_end, pharmacyTimezone)}`
                      : 'No rostered times for this session'}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!hasRosteredTimes || saving || loadingTimeline || readOnly}
                  onClick={handleUseRosteredTimes}
                  sx={{ minHeight: 36 }}
                >
                  Use rostered times
                </Button>
              </Box>

              {/* Endpoints */}
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    type="datetime-local"
                    label="Start"
                    value={startLocal}
                    onChange={(e) => {
                      setStartLocal(e.target.value);
                      setSaveError('');
                    }}
                    disabled={saving || loadingTimeline || !startEvent || readOnly}
                    InputLabelProps={{ shrink: true }}
                    helperText={
                      startEvent
                        ? `Recorded: ${clockTime(startEvent.original_timestamp, pharmacyTimezone)}`
                        : 'No clock-in recorded'
                    }
                    fullWidth
                    size="small"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    type="datetime-local"
                    label="Finish"
                    value={finishLocal}
                    onChange={(e) => {
                      setFinishLocal(e.target.value);
                      setSaveError('');
                    }}
                    disabled={saving || loadingTimeline || !finishEvent || readOnly}
                    InputLabelProps={{ shrink: true }}
                    helperText={
                      finishEvent
                        ? `Recorded: ${clockTime(finishEvent.original_timestamp, pharmacyTimezone)}`
                        : 'No clock-out recorded'
                    }
                    fullWidth
                    size="small"
                  />
                </Grid>
              </Grid>

              {/* Reason */}
              <TextField
                label="Reason"
                required
                placeholder="e.g. Adjusted to rostered shift per manager approval"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setSaveError('');
                }}
                disabled={saving || loadingTimeline || readOnly}
                multiline
                minRows={2}
                helperText="Required. Explain why these hours are being adjusted."
                fullWidth
              />

              {validationError && (
                <Alert severity="warning">
                  {validationError}
                </Alert>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={
            saving ||
            loadingTimeline ||
            !timelineData ||
            Boolean(loadError) ||
            readOnly ||
            !reason.trim() ||
            !hasChanges ||
            Boolean(validationError)
          }
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ minHeight: 40 }}
        >
          Save adjustments
        </Button>
      </DialogActions>
    </Dialog>
  );
}
