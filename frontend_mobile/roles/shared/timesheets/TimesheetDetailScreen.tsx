import React, { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Button, Card, Chip, Switch, Text, TextInput } from 'react-native-paper';
import { type WorkforceTimesheetDetail, type WorkforceTimesheetCheck, workforce } from '@chemisttasker/shared-core';
import { colors, font, radius, space, touch } from '@/constants/tokens';
import { ContentState } from '@/components/ui/ContentState';
import { canApproveTimesheet, formatPharmacyClock, formatTimesheetMinutes, isSourceCorrectionRequired } from './timesheetDetailPolicy';

export default function TimesheetDetailScreen({ managerMode }: { managerMode: boolean }) {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const timesheetId = Number(id);
  const valid = Number.isSafeInteger(timesheetId) && timesheetId > 0;
  const generation = useRef(0);
  const writeRef = useRef(false);
  const [data, setData] = useState<WorkforceTimesheetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [comment, setComment] = useState('');
  const [workerVisible, setWorkerVisible] = useState(true);
  const [reason, setReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [checkBusy, setCheckBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError('');
    setData(null);
    if (!valid) {
      setError('Invalid timesheet link.');
      setLoading(false);
      return;
    }
    try {
      const result = await workforce.getTimesheet(timesheetId);
      if (request === generation.current) setData(result);
    } catch (failure: any) {
      if (request === generation.current) setError(failure?.response?.data?.detail || failure?.message || 'Unable to load the timesheet.');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [timesheetId, valid]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]));

  const run = async (label: string, action: () => Promise<unknown>, done: string) => {
    if (writeRef.current || !valid) return;
    writeRef.current = true;
    setBusy(label);
    setError('');
    setSuccess('');
    try {
      await action();
      setSuccess(done);
      await load();
    } catch (failure: any) {
      setError(failure?.response?.data?.error || failure?.response?.data?.detail || failure?.message || 'The action could not be saved.');
    } finally {
      writeRef.current = false;
      setBusy('');
    }
  };

  const decideCheck = (check: WorkforceTimesheetCheck, decision: 'RESOLVED' | 'WAIVED' | 'REOPENED') => {
    if (!managerMode || writeRef.current) return;
    if (isSourceCorrectionRequired(check)) {
      setError('Fix this check at its attendance source. It cannot be waived.');
      return;
    }
    const notes = reason.trim();
    if (decision !== 'REOPENED' && !notes) {
      setError('A reason is required to resolve or waive this check.');
      return;
    }
    setCheckBusy(check.id);
    void run('check', () => workforce.decideTimesheetCheck(check.id, decision, notes || 'Reopened for review'), 'Timesheet check updated.').finally(() => {
      setReason('');
      setCheckBusy(null);
    });
  };

  const approve = () => {
    if (!managerMode || !data || !canApproveTimesheet(data, false) || writeRef.current) return;
    const revision = data.revision_number!;
    Alert.alert('Approve timesheet?', `Approve reviewed hours for version ${revision}? Reopening later requires an audit reason.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => void run('approve', () => workforce.approveTimesheet(timesheetId, revision), 'Timesheet approved.') },
    ]);
  };

  const timeZone = data?.snapshot?.period?.timezone || 'Australia/Brisbane';

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Button icon="arrow-left" mode="text" style={styles.back} onPress={() => router.back()}>Back to timesheets</Button>
      <Text variant="headlineSmall" style={styles.title}>{data?.worker?.name || 'Timesheet detail'}</Text>
      <Text style={styles.subtitle}>{data?.snapshot?.pharmacy?.name || 'Review worked and rostered hours'}{data?.snapshot?.period ? ` · ${data.snapshot.period.start_date} to ${data.snapshot.period.end_date}` : ''}</Text>
      {error ? <ContentState kind="error" title="Action requires attention" description={error} actionLabel="Retry loading" onAction={() => void load()} /> : null}
      {success ? <Text style={styles.success} accessibilityRole="alert">{success}</Text> : null}
      {loading ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : null}
      {!loading && data ? <>
        <View style={styles.statuses}>
          <Chip compact>{String(data.status).replaceAll('_', ' ')}</Chip>
          {data.needs_rebuild ? <Chip compact style={styles.warning}>Recalculation needed</Chip> : null}
          {(data.effective_blocking_checks ?? data.blocking_checks) > 0 ? <Chip compact style={styles.danger}>{data.effective_blocking_checks ?? data.blocking_checks} blockers</Chip> : null}
          {data.revision_number != null ? <Chip compact>Version {data.revision_number}</Chip> : null}
        </View>
        <Card mode="outlined" style={styles.card}><Card.Content style={styles.section}>
          <Text style={styles.sectionTitle}>Reviewed hours</Text>
          <View style={styles.metrics}>
            {([
              ['Worked', data.worked_minutes], ['Rostered', data.rostered_minutes],
              ['Planned breaks', data.planned_break_minutes], ['Contracted', data.contracted_minutes],
              ['Approved leave', data.approved_leave_minutes], ['Reviewed', data.reviewed_minutes],
            ] as const).map(([label, amount]) => <View key={label} style={styles.metric}><Text style={styles.small}>{label}</Text><Text style={styles.metricValue}>{formatTimesheetMinutes(amount)}</Text></View>)}
          </View>
        </Card.Content></Card>

        <Card mode="outlined" style={styles.card}><Card.Content style={styles.section}>
          <Text style={styles.sectionTitle}>Daily attendance</Text>
          <Text style={styles.small}>Times shown in {timeZone}, the pharmacy's timezone.</Text>
          {data.snapshot.days.length === 0 ? <Text style={styles.subtitle}>No rostered or worked days in this period.</Text> : data.snapshot.days.map((day, index) =>
            <View key={`${day.date}-${day.session_id ?? 'roster'}-${index}`} style={styles.record}>
              <View style={styles.headingRow}><Text style={styles.day}>{day.date}</Text><Text style={styles.day}>{formatTimesheetMinutes(day.worked_minutes)} worked</Text></View>
              <View style={styles.compare}><Text style={styles.small}> </Text><Text style={styles.columnTitle}>Actual</Text><Text style={styles.columnTitle}>Rostered</Text></View>
              <View style={styles.compare}><Text style={styles.small}>Start</Text><Text style={styles.value}>{formatPharmacyClock(day.actual_start, timeZone)}</Text><Text style={styles.value}>{formatPharmacyClock(day.rostered_start, timeZone)}</Text></View>
              <View style={styles.compare}><Text style={styles.small}>Finish</Text><Text style={styles.value}>{formatPharmacyClock(day.actual_end, timeZone)}</Text><Text style={styles.value}>{formatPharmacyClock(day.rostered_end, timeZone)}</Text></View>
              <View style={styles.compare}><Text style={styles.small}>Break</Text><Text style={styles.value}>{day.recorded_break_minutes} min</Text><Text style={styles.value}>{day.planned_break_minutes} min</Text></View>
            </View>)}
        </Card.Content></Card>

        <Card mode="outlined" style={styles.card}><Card.Content style={styles.section}>
          <Text style={styles.sectionTitle}>Checks and exceptions</Text>
          {data.checks.length === 0 ? <Text style={styles.subtitle}>No checks on this revision.</Text> :
            data.checks.map(check => {
              const resolved = ['RESOLVED', 'WAIVED'].includes(check.decision?.decision ?? '');
              const sourceRequired = isSourceCorrectionRequired(check);
              return <View key={check.id} style={styles.record}>
                <View style={styles.headingRow}><Text style={styles.day}>{check.severity}</Text><Chip compact>{check.decision?.decision || 'Open'}</Chip></View>
                <Text style={styles.value}>{check.message}</Text>
                {check.work_date ? <Text style={styles.small}>{check.work_date}</Text> : null}
                {managerMode && sourceRequired && !resolved ? <>
                  <Text style={styles.warningText}>This exception requires correcting the source attendance. It cannot be waived.</Text>
                  <Button mode="outlined" onPress={() => router.push(check.code === 'UNRESOLVED_PROVISIONAL_ATTENDANCE' ? '/attendance/reviews' : `/attendance/corrections/new?timesheetId=${timesheetId}&sessionId=${data.snapshot.days.find(day => day.date === check.work_date)?.session_id ?? ''}` as any)}>Fix attendance</Button>
                </> : null}
                {managerMode && !sourceRequired ? <>
                  <TextInput mode="outlined" dense label={resolved ? 'Reason to reopen (optional)' : 'Reason to resolve or waive'} value={reason} onChangeText={setReason} multiline disabled={busy !== ''} />
                  <View style={styles.actions}>
                    {resolved ? <Button mode="outlined" disabled={busy !== ''} onPress={() => decideCheck(check, 'REOPENED')}>Reopen check</Button> : <>
                      <Button mode="outlined" disabled={!reason.trim() || busy !== ''} onPress={() => decideCheck(check, 'RESOLVED')}>Resolve</Button>
                      <Button mode="outlined" disabled={!reason.trim() || busy !== ''} onPress={() => decideCheck(check, 'WAIVED')}>Waive</Button>
                    </>}
                  </View>
                </> : null}
              </View>;
            })}
        </Card.Content></Card>

        <Card mode="outlined" style={styles.card}><Card.Content style={styles.section}>
          <Text style={styles.sectionTitle}>Comments</Text>
          {data.comments.length === 0 ? <Text style={styles.subtitle}>No comments yet.</Text> : data.comments.filter(row => managerMode || row.worker_visible).map(row =>
            <View key={row.id} style={styles.record}><Text style={styles.day}>{row.author_name}{managerMode && !row.worker_visible ? ' · Managers only' : ''}</Text><Text style={styles.value}>{row.body}</Text><Text style={styles.small}>{new Date(row.created_at).toLocaleString('en-AU')}</Text></View>)}
          <TextInput mode="outlined" label="Add a comment" multiline value={comment} onChangeText={setComment} maxLength={2000} disabled={busy !== ''} />
          {managerMode ? <View style={styles.headingRow}><Text style={styles.small}>Worker can see this comment</Text><Switch value={workerVisible} onValueChange={setWorkerVisible} disabled={busy !== ''} /></View> : null}
          <Button mode="outlined" disabled={!comment.trim() || busy !== ''} onPress={() => void run('comment', async () => {
            await workforce.addTimesheetComment(timesheetId, comment.trim(), managerMode ? workerVisible : true);
            setComment('');
          }, 'Comment added.')}>Add comment</Button>
        </Card.Content></Card>

        {managerMode ? <Card mode="outlined" style={styles.card}><Card.Content style={styles.section}>
          <Text style={styles.sectionTitle}>Manager decisions</Text>
          {data.status === 'APPROVED' ? <>
            <Text style={styles.subtitle}>A reason is required to reopen approved hours. The audit history is preserved.</Text>
            <TextInput mode="outlined" label="Reason to reopen" multiline value={reopenReason} onChangeText={setReopenReason} disabled={busy !== ''} />
            <Button mode="outlined" disabled={!reopenReason.trim() || busy !== ''} onPress={() => void run('reopen', () => workforce.reopenTimesheet(timesheetId, reopenReason.trim()), 'Timesheet reopened for review.')}>Reopen timesheet</Button>
          </> : <>
            <Button mode="outlined" disabled={busy !== ''} onPress={() => void run('recalculate', () => workforce.recalculateTimesheet(timesheetId), 'Timesheet recalculated.')}>Recalculate from attendance</Button>
            {!canApproveTimesheet(data, false) ? <Text style={styles.warningText}>Approval requires a fresh revision with no blocking exceptions.</Text> : null}
            <Button mode="contained" disabled={busy !== '' || !canApproveTimesheet(data, false)} onPress={approve} contentStyle={styles.touch}>Approve reviewed hours</Button>
          </>}
        </Card.Content></Card> : <>
          {data.status !== 'APPROVED' && data.status !== 'SUBMITTED' ? <Button mode="contained" disabled={!data.revision_number || data.needs_rebuild || busy !== ''} onPress={() => void run('submit', () => workforce.submitTimesheet(timesheetId, data.revision_number!), 'Timesheet submitted for review.')}>Submit reviewed hours</Button> : null}
        </>}
      </> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space['3xl'] },
  back: { alignSelf: 'flex-start' },
  title: { fontFamily: font.outfit.semiBold, color: colors.textPrimary },
  subtitle: { color: colors.textSecondary, lineHeight: 21 },
  success: { color: colors.status.green.fg },
  loading: { paddingVertical: space['3xl'] },
  statuses: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  warning: { backgroundColor: colors.status.amber.bg },
  danger: { backgroundColor: colors.status.red.bg },
  warningText: { color: colors.status.amber.fg, lineHeight: 20 },
  card: { borderColor: colors.border, borderRadius: radius.card, backgroundColor: colors.surfaceBg },
  section: { gap: space.md },
  sectionTitle: { color: colors.textPrimary, fontFamily: font.outfit.semiBold, fontSize: 18 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  metric: { width: '48%', padding: space.md, backgroundColor: colors.subtleBg, borderRadius: radius.nested, gap: space.xs },
  metricValue: { color: colors.textPrimary, fontFamily: font.outfit.semiBold, fontSize: 19, fontVariant: ['tabular-nums'] },
  small: { color: colors.textMuted, fontSize: 12 },
  columnTitle: { flex: 1, color: colors.textSecondary, fontFamily: font.inter.semiBold },
  value: { flex: 1, color: colors.textPrimary, lineHeight: 20 },
  compare: { flexDirection: 'row', alignItems: 'baseline', gap: space.md },
  day: { color: colors.textPrimary, fontFamily: font.inter.semiBold, flexShrink: 1 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  record: { paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  touch: { minHeight: touch.min },
});
