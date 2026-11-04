import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Button, Card, Chip, Text } from 'react-native-paper';
import { rosterV2 } from '@chemisttasker/shared-core';
import { ContentState } from '@/components/ui/ContentState';
import { colors, radius, space, touch } from '@/constants/tokens';

type PublishedShift = {
  assignment_id: number;
  period_id: number | null;
  pharmacy_name: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  role: string;
  is_acknowledged: boolean;
  can_acknowledge: boolean;
};

export default function WorkerPublishedRosterScreen() {
  const request = useRef(0);
  const busyRef = useRef<number | null>(null);
  const [shifts, setShifts] = useState<PublishedShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyPeriod, setBusyPeriod] = useState<number | null>(null);

  const load = useCallback(async () => {
    const generation = ++request.current;
    setLoading(true);
    setError(null);
    setShifts([]);
    try {
      const response = await rosterV2.getWorkerRoster({});
      const rows = Array.isArray((response as any)?.shifts) ? (response as any).shifts : [];
      if (generation === request.current) setShifts(rows);
    } catch (failure: any) {
      if (generation === request.current) setError(failure?.message || 'Could not load the published roster.');
    } finally {
      if (generation === request.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { request.current += 1; };
  }, [load]));

  const acknowledge = async (periodId: number) => {
    if (!Number.isSafeInteger(periodId) || periodId <= 0 || busyRef.current !== null) return;
    busyRef.current = periodId;
    setBusyPeriod(periodId);
    setNotice(null);
    setError(null);
    try {
      await rosterV2.acknowledge({ period_id: periodId, notes: 'Acknowledged in the mobile app' });
      setNotice('Your manager can now see that you acknowledged this roster.');
      await load();
    } catch (failure: any) {
      setError(failure?.message || 'Could not acknowledge the roster.');
    } finally {
      busyRef.current = null;
      setBusyPeriod(null);
    }
  };
  const actionablePeriods = new Set<number>();
  for (const shift of shifts) {
    if (shift.period_id != null && shift.can_acknowledge && !shift.is_acknowledged) actionablePeriods.add(shift.period_id);
  }
  const seenPeriods = new Set<number>();

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text variant="headlineSmall" style={styles.title}>Published shifts</Text>
    <Text style={styles.subtext}>Review your published pharmacy shifts and acknowledge each roster week once. Your acknowledgement confirms you have seen the schedule.</Text>
    {notice ? <Text style={styles.success}>{notice}</Text> : null}
    {error ? <ContentState kind="error" title="Roster action needs attention" description={error} actionLabel="Refresh" onAction={() => void load()} /> : null}
    {loading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.subtext}>Loading published shifts…</Text></View>
      : !error && shifts.length === 0 ? <ContentState kind="empty" title="No published shifts" description="Your pharmacy's published roster will appear here." actionLabel="Refresh" onAction={() => void load()} />
      : shifts.map(shift => {
        const period = shift.period_id;
        const showAction = period != null && actionablePeriods.has(period) && !seenPeriods.has(period);
        if (showAction && period != null) seenPeriods.add(period);
        return <Card key={shift.assignment_id} mode="outlined" style={styles.card}>
          <Card.Content style={styles.cardContent}>
            <View style={styles.row}>
              <Text style={styles.pharmacy}>{shift.pharmacy_name}</Text>
              <Chip compact style={shift.is_acknowledged ? styles.acknowledged : styles.awaiting}>{shift.is_acknowledged ? 'Acknowledged' : 'Not acknowledged'}</Chip>
            </View>
            <Text style={styles.shift}>{shift.slot_date} · {String(shift.start_time || '').slice(0,5)}–{String(shift.end_time || '').slice(0,5)}</Text>
            <Text style={styles.subtext}>{String(shift.role || '').replace(/_/g, ' ')}</Text>
            {showAction ? <Button mode="contained" disabled={busyPeriod !== null || loading} loading={busyPeriod === period} onPress={() => void acknowledge(period)} contentStyle={styles.action}>Acknowledge this week</Button> : null}
          </Card.Content>
        </Card>;
      })}
    <Button mode="outlined" onPress={() => void load()} disabled={loading || busyPeriod !== null} contentStyle={styles.action}>Refresh roster</Button>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space['3xl'] },
  title: { color: colors.textPrimary, fontWeight: '700' },
  subtext: { color: colors.textSecondary, lineHeight: 20 },
  success: { color: colors.status.green.fg },
  loading: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.lg },
  card: { borderRadius: radius.card, borderColor: colors.border, backgroundColor: colors.surfaceBg },
  cardContent: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  pharmacy: { flex: 1, color: colors.textPrimary, fontWeight: '700' },
  shift: { color: colors.textPrimary, fontWeight: '600' },
  acknowledged: { backgroundColor: colors.status.green.bg },
  awaiting: { backgroundColor: colors.status.amber.bg },
  action: { minHeight: touch.min },
});
