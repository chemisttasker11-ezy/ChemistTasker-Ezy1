import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Card, Chip, Text } from 'react-native-paper';
import { formatAttendanceMinutes, workforce } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';

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



export default function MyHoursScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const accountKey = user ? String(user.id ?? user.email ?? user.username ?? '') : '';
  const accountRef = useRef(accountKey);
  accountRef.current = accountKey;
  const requestRef = useRef(0);
  const submitRef = useRef(false);
  const submitGeneration = useRef(0);
  const [snapshot, setSnapshot] = useState<{ account: string; rows: Row[] }>({ account: '', rows: [] });
  const rows = snapshot.account === accountKey ? snapshot.rows : [];
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState<number | null>(null);

  const load = useCallback(async (refresh = false) => {
    const request = ++requestRef.current;
    const current = () => request === requestRef.current && accountRef.current === accountKey;
    if (!accountKey) {
      setLoading(false);
      return;
    }
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const response = await workforce.getMyHours();
      if (current()) setSnapshot({ account: accountKey, rows: Array.isArray(response) ? response : [] });
    } catch (err: any) {
      if (current()) setError(err?.response?.data?.error || err?.message || 'Unable to load your hours.');
    } finally {
      if (current()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [accountKey]);

  useEffect(() => {
    requestRef.current += 1;
    submitGeneration.current += 1;
    submitRef.current = false;
    setSnapshot({ account: accountKey, rows: [] });
    setError('');
    setSubmitting(null);
    setRefreshing(false);
    setLoading(Boolean(accountKey));
    if (accountKey) void load();
    return () => { requestRef.current += 1; submitGeneration.current += 1; };
  }, [accountKey, load]);

  const submit = async (row: Row) => {
    if (!row.revision_number || submitRef.current || !accountKey) return;
    const action = ++submitGeneration.current;
    const scope = accountKey;
    const current = () => submitGeneration.current === action && accountRef.current === scope;
    submitRef.current = true;
    setSubmitting(row.id);
    setError('');
    try {
      await workforce.submitTimesheet(row.id, row.revision_number);
      if (current()) await load();
    } catch (err: any) {
      if (current()) setError(err?.response?.data?.error || err?.message || 'Unable to submit the timesheet.');
    } finally {
      if (current()) {
        submitRef.current = false;
        setSubmitting(null);
      }
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
                <View><Text variant="labelSmall">Rostered</Text><Text variant="titleMedium">{formatAttendanceMinutes(row.rostered_minutes)}</Text></View>
                <View><Text variant="labelSmall">Worked</Text><Text variant="titleMedium">{formatAttendanceMinutes(row.worked_minutes)}</Text></View>
                <View><Text variant="labelSmall">Leave</Text><Text variant="titleMedium">{formatAttendanceMinutes(row.approved_leave_minutes)}</Text></View>
                <View><Text variant="labelSmall">Reviewed</Text><Text variant="titleMedium">{formatAttendanceMinutes(row.reviewed_minutes)}</Text></View>
              </View>
              <View style={styles.checkRow}>
                {row.blocking_checks > 0 && <Chip compact style={styles.blocker}>{row.blocking_checks} blocking</Chip>}
                {row.warning_checks > 0 && <Chip compact>{row.warning_checks} warnings</Chip>}
                {row.needs_rebuild && <Chip compact>Recalculation pending</Chip>}
              </View>
              <Button mode="outlined" onPress={() => router.push(`/my-hours/${row.id}` as any)} disabled={submitting != null}>View days & checks</Button>
              <Button mode="contained" loading={submitting === row.id} disabled={!row.revision_number || row.needs_rebuild || row.status === 'APPROVED' || row.status === 'SUBMITTED' || row.status === 'LOCKED' || submitting != null} onPress={() => submit(row)}>
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
