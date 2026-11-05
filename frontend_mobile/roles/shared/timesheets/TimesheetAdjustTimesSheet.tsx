import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Text, TextInput } from 'react-native-paper';
import { attendance, workforce, type AttendanceTimeline, type AttendanceTimelineEvent } from '@chemisttasker/shared-core';
import { BottomSheet } from '@/components/ui';
import { colors, font, space, touch } from '@/constants/tokens';
import {
  correctionOrder, correctionValidation, formatLocalMinute, resolveAttendanceLocalMinute,
} from './timesheetAdjustmentPolicy';

type Props = {
  timesheetId: number;
  sessionId: number;
  pharmacyId: number;
  workerId: number;
  timeZone: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

function message(error: unknown): string {
  const response = (error as any)?.response?.data;
  return String(response?.detail || response?.error || (error as any)?.message || 'Unable to save attendance correction.');
}

/** Read and correct real event IDs; no direct timesheet-minute edits or unaudited writes. */
export default function TimesheetAdjustTimesSheet({
  timesheetId, sessionId, pharmacyId, workerId, timeZone, onClose, onSaved,
}: Props) {
  const requestRef = useRef(0);
  const busyRef = useRef(false);
  const [timeline, setTimeline] = useState<AttendanceTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [finishLocal, setFinishLocal] = useState('');
  const [reason, setReason] = useState('');

  const reload = useCallback(async (): Promise<boolean> => {
    const ticket = ++requestRef.current;
    setLoading(true);
    setTimeline(null);
    setError('');
    try {
      const result = await attendance.getManagerTimeline(sessionId);
      if (ticket !== requestRef.current) return false;
      if (Number(result.pharmacy_id) !== pharmacyId || Number(result.worker_id) !== workerId || result.session_id !== sessionId) {
        throw new Error('Attendance session does not match this worker and pharmacy.');
      }
      const zone = result.pharmacy_timezone || timeZone;
      const start = result.timeline.find(event => event.event_type === 'CLOCK_IN');
      const finish = result.timeline.find(event => event.event_type === 'CLOCK_OUT');
      const newStart = start ? formatLocalMinute(start.effective_timestamp, zone) : '';
      const newFinish = finish ? formatLocalMinute(finish.effective_timestamp, zone) : '';
      setStartLocal(newStart);
      setFinishLocal(newFinish);
      setTimeline(result);
      return true;
    } catch (failure) {
      if (ticket === requestRef.current) setError(message(failure));
      return false;
    } finally {
      if (ticket === requestRef.current) setLoading(false);
    }
  }, [pharmacyId, sessionId, timeZone, workerId]);

  useEffect(() => {
    void reload();
    return () => { requestRef.current += 1; };
  }, [reload]);

  const zone = timeline?.pharmacy_timezone || timeZone;
  const startEvent = timeline?.timeline.find(event => event.event_type === 'CLOCK_IN') ?? null;
  const finishEvent = timeline?.timeline.find(event => event.event_type === 'CLOCK_OUT') ?? null;
  const origStart = startEvent ? formatLocalMinute(startEvent.effective_timestamp, zone) : '';
  const origFinish = finishEvent ? formatLocalMinute(finishEvent.effective_timestamp, zone) : '';
  const hasChanges = Boolean(
    (startEvent && startLocal !== origStart) || (finishEvent && finishLocal !== origFinish),
  );

  const save = async () => {
    if (busyRef.current || !timeline || !hasChanges || !reason.trim()) return;
    if (!startEvent && !finishEvent) {
      setError('No existing clock events. Use the Missing Punch action to append an event.');
      return;
    }
    const startTarget = startEvent
      ? resolveAttendanceLocalMinute(startLocal, startEvent.effective_timestamp, zone) : null;
    const finishTarget = finishEvent
      ? resolveAttendanceLocalMinute(finishLocal, finishEvent.effective_timestamp, zone) : null;
    if ((startEvent && !startTarget) || (finishEvent && !finishTarget)) {
      setError('The date/time is invalid or does not exist in the pharmacy timezone. Check any daylight-saving transition.');
      return;
    }
    const breaks = timeline.timeline
      .filter(event => event.event_type !== 'CLOCK_IN' && event.event_type !== 'CLOCK_OUT')
      .map(event => event.effective_timestamp);
    const validation = correctionValidation(startTarget, finishTarget, breaks);
    if (validation) { setError(validation); return; }
    const newStart = startEvent && startLocal !== origStart ? startTarget : null;
    const newFinish = finishEvent && finishLocal !== origFinish ? finishTarget : null;
    const byType: Record<string, { event: AttendanceTimelineEvent; stamp: string }> = {};
    if (newStart && startEvent) byType.start = { event: startEvent, stamp: newStart };
    if (newFinish && finishEvent) byType.finish = { event: finishEvent, stamp: newFinish };
    const ordered = correctionOrder(newStart, newFinish, finishEvent?.effective_timestamp ?? null);
    if (!ordered.length) return;

    busyRef.current = true;
    setBusy(true);
    setError('');
    let savedCount = 0;
    try {
      try {
        for (const position of ordered) {
          const change = byType[position];
          await attendance.correct(change.event.event_id, change.stamp, reason.trim());
          savedCount += 1;
        }
      } catch (failure) {
        if (savedCount > 0) {
          // The server records two independent audited events; be explicit when
          // only one succeeded. Recovery must not leave the sheet permanently busy.
          try { await workforce.recalculateTimesheet(timesheetId); } catch { /* refresh still needed */ }
          try { await onSaved(); } catch { /* show original partial-write failure */ }
          try { await reload(); } catch { /* retain the original error */ }
          const detail = 'One clock time was saved, but the other failed: ' + message(failure) + '. Review the recorded times before retrying.';
          setError(detail);
          Alert.alert('Partially saved attendance', detail);
        } else {
          setError(message(failure));
        }
        return;
      }
      try {
        await workforce.recalculateTimesheet(timesheetId);
      } catch (failure) {
        try { await onSaved(); } catch { /* audit write succeeded */ }
        try { await reload(); } catch { /* show recalculation error */ }
        const detail = 'Clock correction saved, but hours could not be recalculated: ' + message(failure) + '. Recalculate the timesheet before approving.';
        setError(detail);
        Alert.alert('Recalculation required', detail);
        return;
      }
      try {
        await onSaved();
        onClose();
      } catch (failure) {
        setError('Clock correction saved, but refreshed hours could not load: ' + message(failure));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <BottomSheet open title="Adjust recorded attendance" onClose={onClose} dismissable={!busy}
      subtitle={'Clock times use the pharmacy timezone: ' + zone}
      footer={<View style={styles.actions}>
        <Button mode="outlined" onPress={onClose} disabled={busy}>Cancel</Button>
        <Button mode="contained" onPress={() => void save()} disabled={busy || loading || !timeline || !hasChanges || !reason.trim()} loading={busy} contentStyle={styles.touch}>Save audited correction</Button>
      </View>}
    >
      <View style={styles.content}>
        <Text style={styles.description}>Adjust only an existing event. Original times remain in the attendance audit trail. Use Missing Punch for absent events.</Text>
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {timeline ? <>
          <Text style={styles.hint}>{'Worker: ' + timeline.worker_name + ' · Pharmacy: ' + timeline.pharmacy_name}</Text>
          {startEvent ? <TextInput mode="outlined" label="Clock-in local time (YYYY-MM-DDTHH:mm)" value={startLocal} onChangeText={setStartLocal} editable={!busy} autoCapitalize="none" autoCorrect={false} /> : <Text style={styles.hint}>No clock-in event. Add it through Missing Punch.</Text>}
          {finishEvent ? <TextInput mode="outlined" label="Clock-out local time (YYYY-MM-DDTHH:mm)" value={finishLocal} onChangeText={setFinishLocal} editable={!busy} autoCapitalize="none" autoCorrect={false} /> : <Text style={styles.hint}>No clock-out event. Add it through Missing Punch.</Text>}
          <TextInput mode="outlined" label="Reason for correction" value={reason} onChangeText={setReason} editable={!busy} multiline maxLength={1000} />
          <Text style={styles.hint}>The original events are retained. Changes to approved hours require reopening the timesheet first. Locked payroll periods must use the separate audited correction process.</Text>
        </> : !loading ? <Button mode="outlined" onPress={() => void reload()}>Retry attendance timeline</Button> : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingVertical: space.md },
  description: { color: colors.textSecondary, lineHeight: 21 },
  hint: { color: colors.textSecondary, fontFamily: font.inter.regular, lineHeight: 20 },
  error: { color: colors.status.red.fg, lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'flex-end' },
  touch: { minHeight: touch.min },
});
