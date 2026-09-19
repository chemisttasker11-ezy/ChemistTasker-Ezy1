import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Card, Chip, Text } from 'react-native-paper';
import {
  fetchPharmaciesService,
  type WorkforceTimesheetPeriod,
  type WorkforceTimesheetRow,
  type WorkforceTimesheetSummary,
} from '@chemisttasker/shared-core';
import { chemistTaskerApi } from '../config/api';

const hours = (minutes?: number | null) => minutes == null ? '—' : `${(minutes / 60).toFixed(2)} h`;

function currentFortnight() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const end = new Date(monday);
  end.setDate(monday.getDate() + 13);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return { start: iso(monday), end: iso(end) };
}

export default function WorkforceTimesheetsScreen() {
  const [pharmacies, setPharmacies] = useState<Array<{ id: number; name: string }>>([]);
  const [pharmacyId, setPharmacyId] = useState<number | null>(null);
  const [periods, setPeriods] = useState<WorkforceTimesheetPeriod[]>([]);
  const [periodId, setPeriodId] = useState<number | null>(null);
  const [summary, setSummary] = useState<WorkforceTimesheetSummary | null>(null);
  const [rows, setRows] = useState<WorkforceTimesheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPharmaciesService({})
      .then((data: any[]) => {
        const mapped = (data || []).map(row => ({ id: Number(row.id), name: row.name || `Pharmacy #${row.id}` }));
        setPharmacies(mapped);
        setPharmacyId(current => current && mapped.some(row => row.id === current) ? current : (mapped[0]?.id ?? null));
      })
      .catch((failure: any) => setError(failure?.message || 'Unable to load pharmacies.'));
  }, []);

  const loadPeriods = useCallback(async () => {
    if (!pharmacyId) {
      setPeriods([]); setPeriodId(null); return;
    }
    const next = await chemistTaskerApi.workforce.listTimesheetPeriods(pharmacyId);
    setPeriods(next);
    setPeriodId(current => current && next.some(row => row.id === current) ? current : (next[0]?.id ?? null));
  }, [pharmacyId]);

  const loadPeriod = useCallback(async () => {
    if (!periodId) {
      setSummary(null); setRows([]); return;
    }
    const [nextSummary, nextRows] = await Promise.all([
      chemistTaskerApi.workforce.getTimesheetPeriodSummary(periodId),
      chemistTaskerApi.workforce.listTimesheets(periodId),
    ]);
    setSummary(nextSummary);
    setRows(nextRows);
  }, [periodId]);

  const refresh = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      await loadPeriods();
      await loadPeriod();
    } catch (failure: any) {
      setError(failure?.message || 'Unable to load timesheets.');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [loadPeriod, loadPeriods]);

  useEffect(() => { void loadPeriods().catch((failure: any) => setError(failure?.message || 'Unable to load timesheet periods.')).finally(() => setLoading(false)); }, [loadPeriods]);
  useEffect(() => { void loadPeriod().catch((failure: any) => setError(failure?.message || 'Unable to load timesheets.')); }, [loadPeriod]);

  const selectedPeriod = useMemo(() => periods.find(row => row.id === periodId) ?? null, [periodId, periods]);

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); await loadPeriods(); await loadPeriod(); }
    catch (failure: any) { setError(failure?.message || 'Unable to complete this action.'); }
    finally { setBusy(false); }
  };

  const openCurrent = () => {
    if (!pharmacyId) return;
    const range = currentFortnight();
    void run(async () => {
      const opened = await chemistTaskerApi.workforce.openTimesheetPeriod(pharmacyId, range.start, range.end);
      setPeriodId(opened.id);
    });
  };

  const lockPeriod = () => {
    if (!periodId) return;
    Alert.alert('Lock reviewed period?', 'Locked time becomes immutable and later corrections require the adjustment workflow.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Lock', style: 'destructive', onPress: () => void run(() => chemistTaskerApi.workforce.lockTimesheetPeriod(periodId)) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} />} contentContainerStyle={styles.content}>
        <View>
          <Text variant="headlineMedium" style={styles.title}>Timesheets</Text>
          <Text variant="bodyMedium" style={styles.subtitle}>Review rostered, worked and reviewed time before payroll or external payroll hand-off.</Text>
        </View>

        {!!error && <Card style={styles.error}><Card.Content><Text style={styles.errorText}>{error}</Text></Card.Content></Card>}

        <Text variant="labelLarge">Pharmacy</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {pharmacies.map(pharmacy => <Chip key={pharmacy.id} selected={pharmacyId === pharmacy.id} onPress={() => { setPharmacyId(pharmacy.id); setPeriodId(null); }}>{pharmacy.name}</Chip>)}
        </ScrollView>

        <View style={styles.actionRow}>
          <Button mode="outlined" disabled={!pharmacyId || busy} onPress={openCurrent}>Open current fortnight</Button>
          <Button disabled={!periodId || busy || selectedPeriod?.status === 'LOCKED'} onPress={() => void run(() => chemistTaskerApi.workforce.recalculateTimesheetPeriod(periodId!, true))}>Recalculate</Button>
          <Button disabled={!periodId || busy || selectedPeriod?.status === 'LOCKED'} textColor="#B42318" onPress={lockPeriod}>Lock</Button>
        </View>

        {!!periods.length && <>
          <Text variant="labelLarge">Period</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {periods.map(period => <Chip key={period.id} selected={periodId === period.id} onPress={() => setPeriodId(period.id)}>{period.start_date} – {period.end_date} · {period.status}</Chip>)}
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
            <View><Text variant="labelSmall">Rostered</Text><Text>{hours(row.rostered_minutes)}</Text></View>
            <View><Text variant="labelSmall">Worked</Text><Text>{hours(row.worked_minutes)}</Text></View>
            <View><Text variant="labelSmall">Reviewed</Text><Text>{hours(row.reviewed_minutes)}</Text></View>
            <View><Text variant="labelSmall">Checks</Text><Text>{row.blocking_checks} blocking · {row.warning_checks} warning</Text></View>
          </View>
          <View style={styles.actionRow}>
            <Button compact disabled={busy || !row.revision_number || row.needs_rebuild || row.status === 'APPROVED'} onPress={() => void run(() => chemistTaskerApi.workforce.approveTimesheet(row.id, row.revision_number!, 'Approved from mobile manager timesheets'))}>Approve</Button>
            <Button compact disabled={busy || selectedPeriod?.status === 'LOCKED'} onPress={() => void run(() => chemistTaskerApi.workforce.recalculateTimesheet(row.id))}>Recalculate</Button>
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
