import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator, Button, Checkbox, Dialog, Divider,
  HelperText, Portal, ProgressBar, Text, TextInput,
} from 'react-native-paper';
import {
  type OperationTask, getOperationTask, getOperationMySteps,
  toggleOperationStep, submitOperationWork, reopenOperationWork,
  recordOperationKpi, verifyOperationTask, managerReopenOperationTask,
} from '@chemisttasker/shared-core';

type Props = { taskId: number | null; onDismiss: () => void; onUpdated: () => void };

function idempotencyId(): string {
  // UUID is a collision-resistant retry token, not a secret or authentication factor.
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const str = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  return str.slice(0, 8) + '-' + str.slice(8, 12) + '-' + str.slice(12, 16)
    + '-' + str.slice(16, 20) + '-' + str.slice(20);
}

function messageOf(e: unknown) {
  return e instanceof Error ? e.message : 'Unable to complete the operation.';
}

export default function OperationTaskDialogNative({ taskId, onDismiss, onUpdated }: Props) {
  const [task, setTask] = useState<OperationTask | null>(null);
  const [doneSteps, setDoneSteps] = useState<string[]>([]);
  const [workerCanAct, setWorkerCanAct] = useState(false);
  const [evidence, setEvidence] = useState('');
  const [kpiValue, setKpiValue] = useState('1');
  const [pendingKpiKey, setPendingKpiKey] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  useEffect(() => {
    if (!taskId) { setTask(null); return; }
    let alive = true;
    setLoading(true); setError(''); setSuccess('');
    Promise.all([getOperationTask(taskId), getOperationMySteps(taskId).catch(() => null)])
      .then(([current, own]) => {
        if (!alive) return;
        setTask(current);
        setDoneSteps(own?.completed_step_ids ?? []);
        setWorkerCanAct(Boolean(own));
      })
      .catch(e => { if (alive) setError(messageOf(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [taskId]);

  async function act(callback: () => Promise<unknown>, ok: string): Promise<boolean> {
    if (!taskId || busy) return false;
    setBusy(true); setError(''); setSuccess('');
    try {
      await callback();
      const [current, own] = await Promise.all([
        getOperationTask(taskId), getOperationMySteps(taskId).catch(() => null),
      ]);
      setTask(current); setDoneSteps(own?.completed_step_ids ?? []);
      setWorkerCanAct(Boolean(own));
      setSuccess(ok); onUpdated();
      return true;
    } catch (e) { setError(messageOf(e)); return false; }
    finally { setBusy(false); }
  }
  const required = task?.checklist.filter(x => x.required) ?? [];
  const done = required.filter(x => doneSteps.includes(x.id)).length;
  const completed = !required.length || required.length === done;
  const locked = task?.progress.verified || task?.progress.status === 'FINISHED' ||
    task?.progress.status === 'AWAITING_VERIFICATION';
  return (
    <Portal>
      <Dialog visible={taskId !== null} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>{task?.title ?? 'Operational task'}</Dialog.Title>
        <Dialog.ScrollArea style={styles.scroll}>
          <ScrollView contentContainerStyle={styles.body}>
            {loading && <ActivityIndicator accessibilityLabel="Loading operational task" />}
            {error ? <HelperText type="error" visible>{error}</HelperText> : null}
            {success ? <Text variant="bodyMedium" style={styles.good}>{success}</Text> : null}
            {task && <>
              <Text variant="bodyMedium">{task.date} · {task.area}</Text>
              <Text variant="bodySmall">{task.description}</Text>
              <Text variant="bodySmall" style={styles.muted}>{task.progress.completed} of {task.progress.assigned} staff submitted · {task.progress.status.replaceAll('_', ' ')}</Text>
              <Divider style={styles.divider} />
              <Text variant="titleMedium">Checklist</Text>
              <Text variant="bodySmall" style={styles.muted}>{done}/{required.length} required steps checked</Text>
              <ProgressBar progress={required.length ? done / required.length : 1} style={styles.progress}/>
              {task.checklist.map(step => (
                <View key={step.id} style={styles.row}>
                  <Checkbox status={doneSteps.includes(step.id) ? 'checked' : 'unchecked'}
                    disabled={!workerCanAct || busy || Boolean(locked)}
                    onPress={() => void act(
                      () => toggleOperationStep(task.id, step.id, !doneSteps.includes(step.id), evidence),
                      'Step recorded in the calendar task.',
                    )} />
                  <Text style={styles.flex} onPress={() => {
                    if (workerCanAct && !busy && !locked) void act(
                      () => toggleOperationStep(task.id, step.id, !doneSteps.includes(step.id), evidence),
                      'Step updated.',
                    );
                  }}>{step.label}{step.required ? '' : ' (optional)'}</Text>
                </View>
              ))}
              {workerCanAct && task.checklist.length > 0 && <TextInput label="Evidence or exception note (no patient details)"
                mode="outlined" multiline value={evidence} maxLength={2000} onChangeText={setEvidence}/>}
              {task.target_value !== null && <>
                <Divider style={styles.divider}/>
                <Text variant="titleMedium">Team progress</Text>
                <Text variant="bodyMedium">{task.progress.kpi_actual} / {task.target_value} {task.target_unit}</Text>
                <ProgressBar progress={task.target_value ? Math.min(1, task.progress.kpi_actual / task.target_value) : 1}
                  style={styles.progress}/>
                {workerCanAct && <View style={styles.row}>
                  <TextInput mode="outlined" label="Increment" keyboardType="number-pad" style={styles.flex}
                    value={kpiValue} onChangeText={value => { setKpiValue(value); setPendingKpiKey(null); }}/>
                  <Button disabled={busy || !Number.isInteger(Number(kpiValue)) || Number(kpiValue) < 1}
                    mode="outlined" onPress={() => { const key = pendingKpiKey ?? idempotencyId(); setPendingKpiKey(key);
                      void act(() => recordOperationKpi(task.id, Number(kpiValue), key), 'KPI update recorded.').then(ok => { if (ok) setPendingKpiKey(null); }); }}>Record</Button>
                </View>}
              </>}
              {task.training_url ? <Button icon="open-in-new"
                onPress={() => void Linking.openURL(task.training_url).catch(e => setError(messageOf(e)))}>
                Open training material
              </Button> : null}
              {workerCanAct && task.calendar_note_id && <View style={styles.row}>
                <Button mode="contained" disabled={busy || !completed || Boolean(task.progress.verified)}
                  onPress={() => void act(() => submitOperationWork(task.calendar_note_id!, task.date),
                    'Completion saved to the calendar.')}>Submit</Button>
                <Button mode="outlined" disabled={busy || Boolean(task.progress.verified)}
                  onPress={() => void act(() => reopenOperationWork(task.calendar_note_id!, task.date),
                    'Task reopened.')}>Reopen</Button>
              </View>}
              {task.progress.verified && task.can_manage && <>
                <Divider style={styles.divider}/>
                <Text variant="titleMedium">Authorise correction</Text>
                <TextInput mode="outlined" label="Correction reason (10 characters minimum)"
                  value={correctionReason} multiline maxLength={2000} onChangeText={setCorrectionReason}/>
                <Button mode="outlined" disabled={busy || correctionReason.trim().length < 10}
                  onPress={() => void act(() => managerReopenOperationTask(task.id, correctionReason),
                    'Verification reopened. Workers must resubmit.').then(ok => {if (ok) setCorrectionReason('');})}>
                  Authorise correction
                </Button>
              </>}
              {task.requires_verification && task.progress.status === 'AWAITING_VERIFICATION' && <>
                <Divider style={styles.divider}/>
                <Text variant="titleMedium">Independent supervisor verification</Text>
                <TextInput mode="outlined" label="Sign-off note" multiline maxLength={2000}
                  value={reviewNote} onChangeText={setReviewNote}/>
                <Button mode="contained" icon="shield-check" disabled={busy}
                  onPress={() => void act(() => verifyOperationTask(task.id, reviewNote),
                    'Independent verification recorded.')}>Verify</Button>
              </>}
            </>}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions><Button onPress={onDismiss}>Close</Button></Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { maxHeight: '90%', backgroundColor: '#ffffff' },
  scroll: { maxHeight: 540 },
  body: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 120 },
  muted: { opacity: 0.7 },
  divider: { marginVertical: 8 },
  progress: { height: 8, borderRadius: 8 },
  good: { color: '#087f5b' },
});
