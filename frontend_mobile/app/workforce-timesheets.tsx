import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, List, Text, TextInput } from 'react-native-paper';
import { BrandActivityIndicator as ActivityIndicator } from '@/components/ui/BrandActivityIndicator';
import {
  fetchPharmaciesService,
  formatAttendanceMinutes,
  type WorkforceTimesheetPeriod,
  type WorkforceTimesheetRow,
  type WorkforceTimesheetSummary,
  workforce,
} from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { RootPageHeader } from '@/components/RootPageHeader';

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
  const { selectedPharmacyId: globalPharmacyId, isLoading: workspaceLoading } = useWorkspace();

  const accountKey = user ? String(user.id ?? user.email ?? user.username ?? '') : '';
  const accountRef = useRef(accountKey);
  accountRef.current = accountKey;
  const globalPharmacyRef = useRef(globalPharmacyId);
  globalPharmacyRef.current = globalPharmacyId;

  const initializedAccountRef = useRef('');
  const writeRef = useRef(false);
  const writeGeneration = useRef(0);
  const refreshRequestRef = useRef(0);

  const [pharmacyPickerOpen, setPharmacyPickerOpen] = useState(false);
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [pharmacyQuery, setPharmacyQuery] = useState('');
  const [periodQuery, setPeriodQuery] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [loadedAccount, setLoadedAccount] = useState('');
  const [pharmacies, setPharmacies] = useState<{ id: number; name: string }[]>([]);
  const [pharmacyId, setPharmacyId] = useState<number | null>(null);
  const pharmacyRef = useRef<number | null>(null);
  pharmacyRef.current = pharmacyId;

  const [periods, setPeriods] = useState<WorkforceTimesheetPeriod[]>([]);
  const [periodId, setPeriodId] = useState<number | null>(null);
  const periodRef = useRef<number | null>(null);
  periodRef.current = periodId;

  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [periodsLoadedPharmacyId, setPeriodsLoadedPharmacyId] = useState<number | null>(null);

  const periodsRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const [summary, setSummary] = useState<WorkforceTimesheetSummary | null>(null);
  const [rows, setRows] = useState<WorkforceTimesheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const isBusy = busy || Boolean(writeRef.current);
  const isInteractingDisabled = isBusy || refreshing || loading || periodsLoading;

  useEffect(() => {
    let active = true;

    const accountChanged = initializedAccountRef.current !== accountKey;
    if (accountChanged) {
      periodsRequestRef.current += 1;
      detailRequestRef.current += 1;
      writeGeneration.current += 1;
      writeRef.current = false;
      refreshRequestRef.current += 1;
      setRefreshing(false);
      setLoadedAccount('');
      setPharmacies([]);
      setPharmacyId(null);
      setPeriodId(null);
      setPeriods([]);
      setPeriodsLoadedPharmacyId(null);
      setPeriodsLoading(false);
      setSummary(null);
      setRows([]);
      setBusy(false);
      setError('');
      setCorrectionReason('');
    }

    if (!accountKey || workspaceLoading) {
      if (!accountKey) setLoading(false);
      return () => { active = false; };
    }

    if (!accountChanged && initializedAccountRef.current === accountKey && loadedAccount === accountKey && retryCount === 0) {
      return () => { active = false; };
    }

    setLoading(true);
    void fetchPharmaciesService({})
      .then((data: any[]) => {
        if (!active || accountRef.current !== accountKey) return;
        const mapped = (data || []).map((row: any) => ({
          id: Number(row.id),
          name: row.name || `Pharmacy #${row.id}`,
        }));
        setPharmacies(mapped);
        const preferredId = globalPharmacyRef.current;
        setPharmacyId(current => {
          if (current && mapped.some(row => row.id === current)) return current;
          if (preferredId != null && mapped.some(row => row.id === preferredId)) {
            return preferredId;
          }
          return mapped[0]?.id ?? null;
        });
        setLoadedAccount(accountKey);
        initializedAccountRef.current = accountKey;
      })
      .catch((failure: any) => {
        if (active && accountRef.current === accountKey) {
          setError(failure?.message || 'Unable to load pharmacies.');
        }
      })
      .finally(() => {
        if (active && accountRef.current === accountKey) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      if (accountRef.current !== accountKey) {
        periodsRequestRef.current += 1;
        detailRequestRef.current += 1;
        writeGeneration.current += 1;
        writeRef.current = false;
        refreshRequestRef.current += 1;
        setRefreshing(false);
      }
    };
  }, [accountKey, workspaceLoading, retryCount]);

  const loadPeriods = useCallback(async () => {
    const request = ++periodsRequestRef.current;
    const scope = accountKey;
    const requestedPharmacy = pharmacyId;
    const current = () => request === periodsRequestRef.current && accountRef.current === scope && pharmacyRef.current === requestedPharmacy;
    if (!pharmacyId || loadedAccount !== scope) {
      setPeriods([]);
      setPeriodId(null);
      setPeriodsLoadedPharmacyId(null);
      setPeriodsLoading(false);
      return;
    }
    setPeriodsLoading(true);
    try {
      const next = await workforce.listTimesheetPeriods(pharmacyId) as WorkforceTimesheetPeriod[];
      if (!current()) return;
      setPeriods(next);
      setPeriodId(curr => curr && next.some(row => row.id === curr) ? curr : (next[0]?.id ?? null));
      setPeriodsLoadedPharmacyId(requestedPharmacy);
    } catch (failure) {
      if (current()) {
        setPeriodsLoadedPharmacyId(null);
        throw failure;
      }
    } finally {
      if (current()) {
        setPeriodsLoading(false);
      }
    }
  }, [pharmacyId, accountKey, loadedAccount]);

  const loadPeriod = useCallback(async () => {
    const request = ++detailRequestRef.current;
    const scope = accountKey;
    const requestedPeriod = periodId;
    const requestedPharmacy = pharmacyId;
    const current = () => request === detailRequestRef.current && accountRef.current === scope && periodRef.current === requestedPeriod && pharmacyRef.current === requestedPharmacy;
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
  }, [periodId, pharmacyId, accountKey, loadedAccount]);

  const refresh = useCallback(async (pull = false) => {
    if (busy || writeRef.current) return;
    const refreshToken = ++refreshRequestRef.current;
    const requestedAccount = accountKey;
    const requestedPharmacy = pharmacyId;
    const isCurrent = () =>
      refreshToken === refreshRequestRef.current &&
      accountRef.current === requestedAccount &&
      pharmacyRef.current === requestedPharmacy;

    if (pull) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      await loadPeriods();
      await loadPeriod();
    } catch (failure: any) {
      if (isCurrent()) setError(failure?.message || 'Unable to load timesheets.');
    } finally {
      if (isCurrent()) {
        if (pull) setRefreshing(false); else setLoading(false);
      }
    }
  }, [loadPeriod, loadPeriods, accountKey, pharmacyId, busy]);

  useEffect(() => {
    const account = accountKey;
    const pharmacy = pharmacyId;
    const current = () => accountRef.current === account && pharmacyRef.current === pharmacy;
    void loadPeriods()
      .catch((failure: any) => { if (current()) setError(failure?.message || 'Unable to load timesheet periods.'); });
  }, [loadPeriods, accountKey, pharmacyId]);

  useFocusEffect(useCallback(() => {
    const account = accountKey;
    const pharmacy = pharmacyId;
    void loadPeriod().catch((failure: any) => {
      if (accountRef.current === account && pharmacyRef.current === pharmacy) setError(failure?.message || 'Unable to load timesheets.');
    });
    return () => { detailRequestRef.current += 1; };
  }, [loadPeriod, accountKey, pharmacyId]));

  const selectedPharmacy = useMemo(() => pharmacies.find(p => p.id === pharmacyId) ?? null, [pharmacies, pharmacyId]);
  const selectedPharmacyName = selectedPharmacy?.name || (pharmacyId ? `Pharmacy #${pharmacyId}` : 'this pharmacy');
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
      if (actionId === writeGeneration.current) { writeRef.current = false; setBusy(false); }
    }
  };

  const openCurrent = () => {
    if (!pharmacyId || isBusy || loading || periodsLoading || periodsLoadedPharmacyId !== pharmacyId) return;
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
    <>
      <RootPageHeader title="Timesheets" disabled={isBusy} />
      <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
        <View style={styles.content}>
          <Text variant="headlineSmall">Timesheets</Text>
          {!accountKey ? (
            <Text>Sign in to review timesheets.</Text>
          ) : error ? (
            <View style={styles.retryContainer}>
              <Card style={styles.error}>
                <Card.Content>
                  <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>
                </Card.Content>
              </Card>
              <Button
                mode="outlined"
                style={styles.actionButton}
                contentStyle={styles.buttonContent}
                onPress={() => {
                  setError('');
                  setLoading(true);
                  setRetryCount(c => c + 1);
                }}
              >
                Retry
              </Button>
            </View>
          ) : (
            <ActivityIndicator accessibilityLabel="Loading authorized pharmacy timesheets" />
          )}
        </View>
      </SafeAreaView>
    </>
  );

  return (
    <>
      <RootPageHeader title="Timesheets" disabled={isBusy} />
      <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} />} contentContainerStyle={styles.content}>
          <View>
            <Text variant="headlineMedium" style={styles.title}>Timesheets</Text>
            <Text variant="bodyMedium" style={styles.subtitle}>Review rostered, worked and reviewed time before payroll or external payroll hand-off. Recalculate uses attendance already received; sync offline kiosks at the terminal first.</Text>
          </View>

          {!!error && <Card style={styles.error}><Card.Content><Text style={styles.errorText}>{error}</Text></Card.Content></Card>}

          <Text variant="labelLarge">Pharmacy</Text>
          {pharmacyId != null && <Text variant="bodyMedium">Current: {pharmacies.find(pharmacy => pharmacy.id === pharmacyId)?.name}</Text>}
          <Button mode="outlined" icon={pharmacyPickerOpen ? "chevron-up" : "chevron-down"} disabled={isInteractingDisabled} accessibilityState={{ expanded: pharmacyPickerOpen, disabled: isInteractingDisabled }} onPress={() => setPharmacyPickerOpen(open => !open)}>
            {pharmacyId == null ? 'Choose pharmacy' : 'Change pharmacy'}
          </Button>
          {pharmacyPickerOpen && <View>
            <TextInput mode="outlined" label="Search pharmacies" value={pharmacyQuery} onChangeText={setPharmacyQuery} disabled={isInteractingDisabled} />
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 240 }}>
              {pharmacies.filter(pharmacy => pharmacy.name.toLowerCase().includes(pharmacyQuery.toLowerCase())).map(pharmacy => (
                <List.Item key={pharmacy.id} title={() => <Text>{pharmacy.name}</Text>} left={pharmacyId === pharmacy.id ? props => <List.Icon {...props} icon="check" /> : undefined} accessibilityRole="radio" accessibilityState={{ checked: pharmacyId === pharmacy.id, disabled: isInteractingDisabled }} disabled={isInteractingDisabled} onPress={() => {
                  if (writeRef.current || isInteractingDisabled) return;
                  setError('');
                  writeGeneration.current += 1;
                  writeRef.current = false;
                  setBusy(false);
                  refreshRequestRef.current += 1;
                  setRefreshing(false);
                  periodsRequestRef.current += 1;
                  detailRequestRef.current += 1;
                  setPharmacyId(pharmacy.id);
                  setPeriodId(null);
                  setPeriods([]);
                  setPeriodsLoadedPharmacyId(null);
                  setPeriodsLoading(true);
                  setSummary(null);
                  setRows([]);
                  setPharmacyPickerOpen(false);
                }} />
              ))}
            </ScrollView>
          </View>}

          <View style={styles.actionContainer}>
            <View style={styles.actionRow}>
              <Button
                mode="contained"
                style={styles.actionButton}
                contentStyle={styles.buttonContent}
                disabled={!pharmacyId || isBusy || loading || periodsLoading || periodsLoadedPharmacyId !== pharmacyId}
                onPress={openCurrent}
              >
                Open current fortnight
              </Button>
              <Button
                mode="outlined"
                style={styles.actionButton}
                contentStyle={styles.buttonContent}
                disabled={!periodId || isBusy || selectedPeriod?.status === 'LOCKED'}
                onPress={() => void run(() => workforce.recalculateTimesheetPeriod(periodId!, true))}
              >
                Recalculate
              </Button>
              <Button
                mode="outlined"
                style={[styles.actionButton, styles.lockButton]}
                contentStyle={styles.buttonContent}
                textColor={!periodId || isBusy || selectedPeriod?.status === 'LOCKED' ? undefined : '#B42318'}
                disabled={!periodId || isBusy || selectedPeriod?.status === 'LOCKED'}
                onPress={lockPeriod}
              >
                Lock
              </Button>
            </View>
            {!periodId && !loading && !periodsLoading && !error && !!pharmacyId && (
              <Text variant="bodySmall" style={styles.disabledReason}>
                Select or open a period to recalculate or lock.
              </Text>
            )}
            {selectedPeriod?.status === 'LOCKED' && (
              <Text variant="bodySmall" style={styles.disabledReason}>
                This period is locked. Enter a reason below to correct it.
              </Text>
            )}
            {selectedPeriod?.status === 'LOCKED' ? (
              <View style={styles.correctionContainer}>
                <TextInput
                  mode="outlined"
                  dense
                  label="Reason for correcting this locked period"
                  value={correctionReason}
                  onChangeText={setCorrectionReason}
                  editable={!isBusy}
                  disabled={isBusy}
                />
                <Button
                  mode="outlined"
                  style={styles.actionButton}
                  contentStyle={styles.buttonContent}
                  textColor="#B42318"
                  disabled={isBusy}
                  onPress={correctPeriod}
                >
                  Correct locked period
                </Button>
              </View>
            ) : null}
          </View>

          {!!periods.length && (
            <>
              <Text variant="labelLarge">Period</Text>
              {selectedPeriod && <Text variant="bodyMedium">Current: {selectedPeriod.start_date} – {selectedPeriod.end_date} · {selectedPeriod.status}</Text>}
              <Button mode="outlined" icon={periodPickerOpen ? "chevron-up" : "chevron-down"} disabled={isInteractingDisabled} accessibilityState={{ expanded: periodPickerOpen, disabled: isInteractingDisabled }} onPress={() => setPeriodPickerOpen(open => !open)}>
                {periodId == null ? 'Choose period' : 'Change period'}
              </Button>
              {periodPickerOpen && <View>
                <TextInput mode="outlined" label="Search periods" value={periodQuery} onChangeText={setPeriodQuery} disabled={isInteractingDisabled} />
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 240 }}>
                  {periods.filter(period => `${period.start_date} ${period.end_date} ${period.status}`.toLowerCase().includes(periodQuery.toLowerCase())).map(period => (
                    <List.Item key={period.id} title={() => <Text>{period.start_date} – {period.end_date} · {period.status}</Text>} left={periodId === period.id ? props => <List.Icon {...props} icon="check" /> : undefined} accessibilityRole="radio" accessibilityState={{ checked: periodId === period.id, disabled: isInteractingDisabled }} disabled={isInteractingDisabled} onPress={() => {
                      if (writeRef.current || isInteractingDisabled) return;
                      detailRequestRef.current += 1;
                      setPeriodId(period.id);
                      setSummary(null);
                      setRows([]);
                      setPeriodPickerOpen(false);
                    }} />
                  ))}
                </ScrollView>
              </View>}
            </>
          )}

          {!loading && !periodsLoading && !error && pharmacyId != null && periodsLoadedPharmacyId === pharmacyId && periods.length === 0 && (
            <Card style={styles.emptyCard}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.emptyTitle}>No open periods</Text>
                <Text variant="bodyMedium" style={styles.emptyBody}>
                  No timesheet period is currently open for {selectedPharmacyName}. Tap &ldquo;Open current fortnight&rdquo; above to start reviewing timesheets.
                </Text>
              </Card.Content>
            </Card>
          )}

          {(loading || periodsLoading) && <ActivityIndicator style={{ marginVertical: 24 }} accessibilityLabel="Loading timesheets" />}
          {summary && (
            <Card>
              <Card.Content>
                <Text variant="titleMedium" style={styles.strong}>Period health</Text>
                <View style={styles.metrics}>
                  <View><Text variant="labelSmall">Timesheets</Text><Text variant="titleMedium">{summary.total_timesheets}</Text></View>
                  <View><Text variant="labelSmall">Ready</Text><Text variant="titleMedium">{summary.ready_timesheets}</Text></View>
                  <View><Text variant="labelSmall">Blocking</Text><Text variant="titleMedium">{summary.blocking_timesheets}</Text></View>
                  <View><Text variant="labelSmall">Warnings</Text><Text variant="titleMedium">{summary.warning_checks}</Text></View>
                </View>
              </Card.Content>
            </Card>
          )}

          {!loading && !periodsLoading && periodId && rows.length === 0 && (
            <Card>
              <Card.Content>
                <Text>No timesheets exist for this period yet.</Text>
              </Card.Content>
            </Card>
          )}

          {rows.map(row => (
            <Card key={row.id}>
              <Card.Content>
                <View style={styles.headerRow}>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium" style={styles.strong}>{row.worker.name}</Text>
                    <Text variant="bodySmall">{row.status.replaceAll('_', ' ')} · revision {row.revision_number ?? '—'}</Text>
                  </View>
                  <Chip compact>{row.needs_rebuild ? 'Rebuild needed' : row.status.replaceAll('_', ' ')}</Chip>
                </View>
                <View style={styles.metrics}>
                  <View><Text variant="labelSmall">Rostered</Text><Text>{formatAttendanceMinutes(row.rostered_minutes)}</Text></View>
                  <View><Text variant="labelSmall">Worked</Text><Text>{formatAttendanceMinutes(row.worked_minutes)}</Text></View>
                  <View><Text variant="labelSmall">Reviewed</Text><Text>{formatAttendanceMinutes(row.reviewed_minutes)}</Text></View>
                  <View><Text variant="labelSmall">Checks</Text><Text>{row.blocking_checks} blocking · {row.warning_checks} warning</Text></View>
                </View>
                <View style={styles.actionRow}>
                  <Button compact mode="contained-tonal" disabled={isBusy} onPress={() => router.push(`/workforce-timesheets/${row.id}` as any)}>Review details</Button>
                  <Button compact disabled={isBusy || selectedPeriod?.status === 'LOCKED'} onPress={() => void run(() => workforce.recalculateTimesheet(row.id))}>Recalculate</Button>
                </View>
              </Card.Content>
            </Card>
          ))}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7FAFF' },
  content: { padding: 18, gap: 14, paddingBottom: 48 },
  title: { fontWeight: '900', color: '#06214A' },
  subtitle: { color: '#52617A', marginTop: 4 },
  chips: { gap: 8, paddingVertical: 4 },
  actionContainer: { gap: 6 },
  actionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  actionButton: { minHeight: 44, justifyContent: 'center', borderRadius: 8 },
  buttonContent: { minHeight: 44, paddingHorizontal: 10 },
  lockButton: { borderColor: '#FECDCA' },
  disabledReason: { color: '#52617A', marginTop: 2, paddingHorizontal: 2 },
  correctionContainer: { width: '100%', gap: 6, marginTop: 4 },
  emptyCard: { backgroundColor: '#FFFFFF', borderColor: '#DCE5F4', borderWidth: 1, borderRadius: 12 },
  emptyTitle: { fontWeight: '700', color: '#06214A', marginBottom: 4 },
  emptyBody: { color: '#52617A', lineHeight: 20 },
  retryContainer: { gap: 12 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  strong: { fontWeight: '800' },
  error: { backgroundColor: '#FFF1F0' },
  errorText: { color: '#B42318' },
});
