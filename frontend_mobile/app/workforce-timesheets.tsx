import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Card, Chip, Text, TextInput } from 'react-native-paper';
import {
  fetchPharmaciesService,
  formatAttendanceMinutes,
  type WorkforceTimesheetPeriod,
  type WorkforceTimesheetRow,
  type WorkforceTimesheetSummary,
  workforce,
} from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';



function currentFortnight() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const end = new Date(monday);
  end.setDate(monday.getDate() + 13);
  const iso = (date: Date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  return { start: iso(monday), end: iso(end) };
}

export default function WorkforceTimesheetsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const accountKey = user ? String(user.id ?? user.email ?? user.username ?? '') : '';
  const accountRef = useRef(accountKey);
  accountRef.current = accountKey;
  const writeRef = useRef(false);
  const writeGeneration = useRef(0);
  const [loadedAccount, setLoadedAccount] = useState('');
  const [pharmacies, setPharmacies] = useState<{ id: number; name: string }[]>([]);
  const [pharmacyId, setPharmacyId] = useState<number | null>(null);
  const pharmacyRef = useRef<number | null>(null);
  pharmacyRef.current = pharmacyId;
  const [periods, setPeriods] = useState<WorkforceTimesheetPeriod[]>([]);
  const [periodId, setPeriodId] = useState<number | null>(null);
  const periodsRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const [summary, setSummary] = useState<WorkforceTimesheetSummary | null>(null);
  const [rows, setRows] = useState<WorkforceTimesheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    periodsRequestRef.current += 1;
    detailRequestRef.current += 1;
    writeGeneration.current += 1;
    writeRef.current = false;
    setLoadedAccount('');
    setPharmacies([]);
    setPharmacyId(null);
    setPeriodId(null);
    setPeriods([]);
    setSummary(null);
    setRows([]);
    setBusy(false);
    setError('');
    setCorrectionReason('');
    if (!accountKey) { setLoading(false); return () => { active = false; }; }
    setLoading(true);
    void fetchPharmaciesService({})
      .then((data: any[]) => {
        if (!active || accountRef.current !== accountKey) return;
        const mapped = (data || []).map(row => ({ id: Number(row.id), name: row.name || `Pharmacy #${row.id}` }));
        setPharmacies(mapped);
        setPharmacyId(current => current && mapped.some(row => row.id === current) ? current : (mapped[0]?.id ?? null));
        setLoadedAccount(accountKey);
      })
      .catch((failure: any) => { if (active && accountRef.current === accountKey) setError(failure?.message || 'Unable to load pharmacies.'); })
      .finally(() => { if (active && accountRef.current === accountKey) setLoading(false); });
    return () => { active = false; periodsRequestRef.current += 1; detailRequestRef.current += 1; };
  }, [accountKey]);

  const loadPeriods = useCallback(async () => {
    const request = ++periodsRequestRef.current;
    const scope = accountKey;
    const current = () => request === periodsRequestRef.current && accountRef.current === scope;
    if (!pharmacyId || loadedAccount !== scope) {
      setPeriods([]); setPeriodId(null); return;
    }
    try {
      const next = await workforce.listTimesheetPeriods(pharmacyId) as WorkforceTimesheetPeriod[];
      if (!current()) return;
      setPeriods(next);
      setPeriodId(current => current && next.some(row => row.id === current) ? current : (next[0]?.id ?? null));
    } catch (failure) {
      if (current()) throw failure;
    }
  }, [pharmacyId, accountKey, loadedAccount]);

  const loadPeriod = useCallback(async () => {
    const request = ++detailRequestRef.current;
    const scope = accountKey;
    const current = () => request === detailRequestRef.current && accountRef.current === scope;
    if (!periodId || loadedAccount !== scope) {
      setSummary(null); setRows([]); return;
    }
    try {
      const [nextSummary, nextRows] = await Promise.all([
        workforce.getTimesheetPeriodSummary(periodId),
        workforce.listTimesheets(periodId),
      ]) as [WorkforceTimesheetSummary, WorkforceTimesheetRow[]];
      if (!current()) return;
      setSummary(nextSummary);
      setRows(nextRows);
    } catch (failure) {
      if (current()) throw failure;
    }
  }, [periodId, accountKey, loadedAccount]);

  const refresh = useCallback(async (pull = false) => {
    const requestedAccount = accountKey;
    const requestedPharmacy = pharmacyId;
    const current = () => accountRef.current === requestedAccount && pharmacyRef.current === requestedPharmacy;
    if (pull) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      await loadPeriods();
      await loadPeriod();
    } catch (failure: any) {
      if (current()) setError(failure?.message || 'Unable to load timesheets.');
    } finally {
      if (current()) { setLoading(false); setRefreshing(false); }
    }
  }, [loadPeriod, loadPeriods, accountKey, pharmacyId]);

  useEffect(() => {
    const account = accountKey;
    const pharmacy = pharmacyId;
    const current = () => accountRef.current === account && pharmacyRef.current === pharmacy;
    void loadPeriods()
      .catch((failure: any) => { if (current()) setError(failure?.message || 'Unable to load timesheet periods.'); })
      .finally(() => { if (current()) setLoading(false); });
  }, [loadPeriods, accountKey, pharmacyId]);
  useFocusEffect(useCallback(() => {
    const account = accountKey;
    const pharmacy = pharmacyId;
    void loadPeriod().catch((failure: any) => {
      if (accountRef.current === account && pharmacyRef.current === pharmacy) setError(failure?.message || 'Unable to load timesheets.');
    });
    return () => { detailRequestRef.current += 1; };
  }, [loadPeriod, accountKey, pharmacyId]));

  const selectedPeriod = useMemo(() => periods.find(row => row.id === periodId) ?? null, [periodId, periods]);

  const run = async (action: () => Promise<unknown>) => {
    if (writeRef.current || !accountKey || loadedAccount !== accountKey) return;
    const scope = accountKey;
    const pharmacy = pharmacyId;
    const actionId = ++writeGeneration.current;
    const current = () => actionId === writeGeneration.current && accountRef.current === scope && pharmacyRef.current === pharmacy;
    writeRef.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
      if (!current()) return;
      await loadPeriods();
      if (current()) await loadPeriod();
    } catch (failure: any) {
      if (current()) setError(failure?.message || 'Unable to complete this action.');
    } finally {
      if (current()) { writeRef.current = false; setBusy(false); }
    }
  };

  const openCurrent = () => {
    if (!pharmacyId) return;
    const range = currentFortnight();
    void run(async () => {
      const requestedAccount = accountKey;
      const requestedPharmacy = pharmacyId;
      const opened = await workforce.openTimesheetPeriod(pharmacyId, range.start, range.end);
      if (accountRef.current === requestedAccount && pharmacyRef.current === requestedPharmacy) setPeriodId(opened.id);
    });
  };

  const [correctionReason, setCorrectionReason] = useState('');

  // Reopen a locked period on purpose to fix a mistake: the current manifest is kept for audit, and locking again
  // creates an adjustment.
  const correctPeriod = () => {
    if (!periodId) return;
    const reason = correctionReason.trim();
    if (!reason) {
      setError('A reason is required to correct a locked period.');
      return;
    }
    Alert.alert('Correct locked period?', 'The period reopens so timesheets can be fixed, approved and locked again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Correct',
        style: 'destructive',
        onPress: () => void run(async () => {
          const requestedAccount = accountKey;
          const requestedPharmacy = pharmacyId;
          await workforce.correctTimesheetPeriod(periodId, reason);
          if (accountRef.current === requestedAccount && pharmacyRef.current === requestedPharmacy) setCorrectionReason('');
        }),
      },
    ]);
  };

  const lockPeriod = () => {
    if (!periodId) return;
    Alert.alert('Lock reviewed period?', 'Locked time is frozen; a mistake can only be fixed with "Correct locked period", which keeps the current manifest for audit.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Lock', style: 'destructive', onPress: () => void run(() => workforce.lockTimesheetPeriod(periodId)) },
    ]);
  };

  // Data from the previous account is hidden immediately, before effects run.
  if (!accountKey || loadedAccount !== accountKey) return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.content}>
        <Text variant="headlineSmall">Timesheets</Text>
        {!accountKey ? <Text>Sign in to review timesheets.</Text> : <ActivityIndicator accessibilityLabel="Loading authorized pharmacy timesheets" />}
        {!!error && <Text accessibilityRole="alert">{error}</Text>}
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} />} contentContainerStyle={styles.content}>
        <View>
          <Button compact icon="arrow-left" onPress={() => router.back()} style={{ alignSelf: 'flex-start', marginBottom: 6 }}>Back</Button>
          <Text variant="headlineMedium" style={styles.title}>Timesheets</Text>
          <Text variant="bodyMedium" style={styles.subtitle}>Review rostered, worked and reviewed time before payroll or external payroll hand-off. Recalculate uses attendance already received; sync offline kiosks at the terminal first.</Text>
        </View>

        {!!error && <Card style={styles.error}><Card.Content><Text style={styles.errorText}>{error}</Text></Card.Content></Card>}

        <Text variant="labelLarge">Pharmacy</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {pharmacies.map(pharmacy => <Chip key={pharmacy.id} selected={pharmacyId === pharmacy.id} onPress={() => { periodsRequestRef.current += 1; detailRequestRef.current += 1; setPharmacyId(pharmacy.id); setPeriodId(null); setPeriods([]); setSummary(null); setRows([]); }}>{pharmacy.name}</Chip>)}
        </ScrollView>

        <View style={styles.actionRow}>
          <Button mode="outlined" disabled={!pharmacyId || busy} onPress={openCurrent}>Open current fortnight</Button>
          <Button disabled={!periodId || busy || selectedPeriod?.status === 'LOCKED'} onPress={() => void run(() => workforce.recalculateTimesheetPeriod(periodId!, true))}>Recalculate</Button>
          <Button disabled={!periodId || busy || selectedPeriod?.status === 'LOCKED'} textColor="#B42318" onPress={lockPeriod}>Lock</Button>
          {selectedPeriod?.status === 'LOCKED' ? (
            <View style={{ width: '100%', gap: 6 }}>
              <TextInput
                mode="outlined"
                dense
                label="Reason for correcting this locked period"
                value={correctionReason}
                onChangeText={setCorrectionReason}
              />
              <Button mode="outlined" textColor="#B42318" disabled={busy} onPress={correctPeriod}>Correct locked period</Button>
            </View>
          ) : null}
        </View>

        {!!periods.length && <>
          <Text variant="labelLarge">Period</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {periods.map(period => <Chip key={period.id} selected={periodId === period.id} onPress={() => { detailRequestRef.current += 1; setPeriodId(period.id); setSummary(null); setRows([]); }}>{period.start_date} – {period.end_date} · {period.status}</Chip>)}
          </ScrollView>
        </>}

        {loading && <ActivityIndicator style={{ marginVertical: 24 }} />}
        {summary && <Card><Card.Content>
          <Text variant="titleMedium" style={styles.strong}>Period health</Text>
          <View style={styles.metrics}>
            <View><Text variant="labelSmall">Timesheets</Text><Text variant="titleMedium">{summary.total_timesheets}</Text></View>
            <View><Text variant="labelSmall">Ready</Text><Text variant="titleMedium">{summary.ready_timesheets}</Text></View>
            <View><Text variant="labelSmall">Blocking</Text><Text variant="titleMedium">{summary.blocking_timesheets}</Text></View>
            <View><Text variant="labelSmall">Warnings</Text><Text variant="titleMedium">{summary.warning_checks}</Text></View>
          </View>
        </Card.Content></Card>}

        {!loading && periodId && rows.length === 0 && <Card><Card.Content><Text>No timesheets exist for this period yet.</Text></Card.Content></Card>}

        {rows.map(row => <Card key={row.id}><Card.Content>
          <View style={styles.headerRow}><View style={{ flex: 1 }}><Text variant="titleMedium" style={styles.strong}>{row.worker.name}</Text><Text variant="bodySmall">{row.status.replaceAll('_', ' ')} · revision {row.revision_number ?? '—'}</Text></View><Chip compact>{row.needs_rebuild ? 'Rebuild needed' : row.status.replaceAll('_', ' ')}</Chip></View>
          <View style={styles.metrics}>
            <View><Text variant="labelSmall">Rostered</Text><Text>{formatAttendanceMinutes(row.rostered_minutes)}</Text></View>
            <View><Text variant="labelSmall">Worked</Text><Text>{formatAttendanceMinutes(row.worked_minutes)}</Text></View>
            <View><Text variant="labelSmall">Reviewed</Text><Text>{formatAttendanceMinutes(row.reviewed_minutes)}</Text></View>
            <View><Text variant="labelSmall">Checks</Text><Text>{row.blocking_checks} blocking · {row.warning_checks} warning</Text></View>
          </View>
          <View style={styles.actionRow}>
            <Button compact mode="contained-tonal" disabled={busy} onPress={() => router.push(`/workforce-timesheets/${row.id}` as any)}>Review details</Button>
            <Button compact disabled={busy || selectedPeriod?.status === 'LOCKED'} onPress={() => void run(() => workforce.recalculateTimesheet(row.id))}>Recalculate</Button>
          </View>
        </Card.Content></Card>)}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7FAFF' },
  content: { padding: 18, gap: 14, paddingBottom: 48 },
  title: { fontWeight: '900', color: '#06214A' },
  subtitle: { color: '#52617A', marginTop: 4 },
  chips: { gap: 8, paddingVertical: 4 },
  actionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  strong: { fontWeight: '800' },
  error: { backgroundColor: '#FFF1F0' },
  errorText: { color: '#B42318' },
});
