import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Card, Chip, Text } from 'react-native-paper';
import { chemistTaskerApi } from '../config/api';

type Row = {
  id: number;
  pharmacy: { id: number; name: string };
  start_date: string;
  end_date: string;
  status: string;
  revision_number: number | null;
  needs_rebuild: boolean;
  rostered_minutes: number;
  worked_minutes: number;
  approved_leave_minutes: number;
  reviewed_minutes: number;
  blocking_checks: number;
  warning_checks: number;
};

const hours = (value?: number | null) => value == null ? '—' : `${(value / 60).toFixed(2)} h`;

export default function MyHoursScreen() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState<number | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const response = await chemistTaskerApi.workforce.getMyHours();
      setRows(Array.isArray(response) ? response : []);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to load your hours.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async (row: Row) => {
    if (!row.revision_number) return;
    setSubmitting(row.id);
    setError('');
    try {
      await chemistTaskerApi.workforce.submitTimesheet(row.id, row.revision_number);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to submit the timesheet.');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
        <Text variant="headlineMedium" style={styles.title}>My Hours</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>Compare rostered and captured hours. Your manager must correct source attendance before approved time changes.</Text>
        {!!error && <Card style={styles.errorCard}><Card.Content><Text style={styles.errorText}>{error}</Text></Card.Content></Card>}
        {loading && <ActivityIndicator style={styles.loading} />}
        {!loading && rows.length === 0 && <Card><Card.Content><Text>No timesheet periods are available yet.</Text></Card.Content></Card>}
        {rows.map((row) => (
          <Card key={row.id} style={styles.card}>
            <Card.Content>
              <View style={styles.headerRow}>
                <View style={styles.flex}>
                  <Text variant="titleMedium" style={styles.pharmacy}>{row.pharmacy.name}</Text>
                  <Text variant="bodySmall">{row.start_date} – {row.end_date}</Text>
                </View>
                <Chip compact>{row.status.replaceAll('_', ' ')}</Chip>
              </View>
              <View style={styles.metricRow}>
                <View><Text variant="labelSmall">Rostered</Text><Text variant="titleMedium">{hours(row.rostered_minutes)}</Text></View>
                <View><Text variant="labelSmall">Worked</Text><Text variant="titleMedium">{hours(row.worked_minutes)}</Text></View>
                <View><Text variant="labelSmall">Leave</Text><Text variant="titleMedium">{hours(row.approved_leave_minutes)}</Text></View>
                <View><Text variant="labelSmall">Reviewed</Text><Text variant="titleMedium">{hours(row.reviewed_minutes)}</Text></View>
              </View>
              <View style={styles.checkRow}>
                {row.blocking_checks > 0 && <Chip compact style={styles.blocker}>{row.blocking_checks} blocking</Chip>}
                {row.warning_checks > 0 && <Chip compact>{row.warning_checks} warnings</Chip>}
                {row.needs_rebuild && <Chip compact>Recalculation pending</Chip>}
              </View>
              <Button mode="contained" loading={submitting === row.id} disabled={!row.revision_number || row.needs_rebuild || row.status === 'APPROVED' || row.status === 'SUBMITTED' || submitting != null} onPress={() => submit(row)}>
                Submit reviewed hours
              </Button>
            </Card.Content>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7FAFF' },
  content: { padding: 18, gap: 14, paddingBottom: 40 },
  title: { fontWeight: '800', color: '#06214A' },
  subtitle: { color: '#52617A', marginBottom: 6 },
  loading: { marginVertical: 32 },
  card: { backgroundColor: '#FFFFFF' },
  errorCard: { backgroundColor: '#FFF1F0' },
  errorText: { color: '#B42318' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  pharmacy: { fontWeight: '800' },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginVertical: 16 },
  checkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  blocker: { backgroundColor: '#FEE4E2' },
});
