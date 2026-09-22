import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Card, Chip, Switch, Text, TextInput } from 'react-native-paper';
import {
  fetchPharmaciesService,
  type WorkforceEmploymentEngagement,
  type WorkforcePayrollConfiguration,
  type WorkforceWorkSettings,
  workforce,
} from '@chemisttasker/shared-core';

const hours = (minutes?: number | null) => minutes == null ? '' : (minutes / 60).toFixed(2);
const pretty = (value?: string | null) => String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());

export default function WorkforceSettingsScreen() {
  const router = useRouter();
  const [pharmacies, setPharmacies] = useState<Array<{ id: number; name: string }>>([]);
  const [pharmacyId, setPharmacyId] = useState<number | null>(null);
  const [payroll, setPayroll] = useState<WorkforcePayrollConfiguration | null>(null);
  const [staff, setStaff] = useState<WorkforceWorkSettings[]>([]);
  const [engagements, setEngagements] = useState<WorkforceEmploymentEngagement[]>([]);
  const [hoursDraft, setHoursDraft] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
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

  const load = useCallback(async (pull = false) => {
    if (!pharmacyId) {
      setPayroll(null); setStaff([]); setEngagements([]); setLoading(false); return;
    }
    if (pull) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const [nextPayroll, nextStaff, nextEngagements] = await Promise.all([
        workforce.getPayrollConfiguration(pharmacyId),
        workforce.listWorkSettings(pharmacyId),
        workforce.listEmploymentEngagements(pharmacyId),
      ]);
      setPayroll(nextPayroll);
      setStaff(nextStaff);
      setEngagements(nextEngagements);
      setHoursDraft(Object.fromEntries(nextStaff.map(row => [row.membership_id, hours(row.contracted_weekly_minutes)])));
    } catch (failure: any) {
      setError(failure?.message || 'Unable to load workforce settings.');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [pharmacyId]);

  useEffect(() => { void load(); }, [load]);

  const currentEngagementByMembership = useMemo(() => {
    const now = new Date();
    const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    const map = new Map<number, WorkforceEmploymentEngagement>();
    for (const row of engagements) {
      if (row.effective_from <= today && (!row.effective_to || row.effective_to >= today)) {
        const current = map.get(row.membership_id);
        if (!current || current.effective_from < row.effective_from) map.set(row.membership_id, row);
      }
    }
    return map;
  }, [engagements]);

  const saveHours = async (row: WorkforceWorkSettings) => {
    const raw = (hoursDraft[row.membership_id] || '').trim();
    const numeric = raw === '' ? null : Number(raw);
    if (numeric != null && (!Number.isFinite(numeric) || numeric < 0 || numeric > 168)) {
      setError('Contracted hours must be between 0 and 168 hours per week.');
      return;
    }
    setBusyKey(`hours-${row.membership_id}`); setError('');
    try {
      await workforce.saveWorkSettings({
        membership_id: row.membership_id,
        contracted_weekly_minutes: numeric == null ? null : Math.round(numeric * 60),
      });
      await load();
    } catch (failure: any) {
      setError(failure?.message || 'Unable to save contracted hours.');
    } finally {
      setBusyKey(null);
    }
  };

  const togglePayroll = async (enabled: boolean) => {
    if (!pharmacyId || !payroll) return;
    setBusyKey('payroll'); setError('');
    try {
      const next = await workforce.updatePayrollConfiguration({
        pharmacy_id: pharmacyId,
        use_chemisttasker_payroll: enabled,
      });
      setPayroll(next);
      await load();
    } catch (failure: any) {
      setError(failure?.message || 'Unable to update payroll configuration.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />} contentContainerStyle={styles.content}>
        <View>
          <Button compact icon="arrow-left" onPress={() => router.back()} style={{ alignSelf: 'flex-start', marginBottom: 6 }}>Back</Button>
          <Text variant="headlineMedium" style={styles.title}>Workforce settings</Text>
          <Text variant="bodyMedium" style={styles.subtitle}>Manage payroll opt-in, contracted hours, and review the dated employment terms frozen into roster and timesheet history.</Text>
        </View>

        {!!error && <Card style={styles.error}><Card.Content><Text style={styles.errorText}>{error}</Text></Card.Content></Card>}

        <Text variant="labelLarge">Pharmacy</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {pharmacies.map(pharmacy => <Chip key={pharmacy.id} selected={pharmacyId === pharmacy.id} onPress={() => setPharmacyId(pharmacy.id)}>{pharmacy.name}</Chip>)}
        </ScrollView>

        {loading ? <ActivityIndicator style={{ marginVertical: 24 }} /> : null}

        {payroll && <Card><Card.Content>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium" style={styles.strong}>Use ChemistTasker Payroll</Text>
              <Text variant="bodySmall">{payroll.use_chemisttasker_payroll ? 'TFN assignments can route to ChemistTasker Payroll when worker setup and employment terms are complete.' : 'Roster, attendance and timesheets stay active while payroll is processed externally.'}</Text>
            </View>
            <Switch disabled={busyKey === 'payroll'} value={payroll.use_chemisttasker_payroll} onValueChange={value => void togglePayroll(value)} />
          </View>
          <View style={{ marginTop: 12, gap: 6 }}>
            <Text variant="bodySmall">ABN workers remain on invoice settlement.</Text>
            <Text variant="bodySmall">TFN workers remain timesheet-only until payroll requirements are complete.</Text>
          </View>
        </Card.Content></Card>}

        <View>
          <Text variant="titleMedium" style={styles.sectionTitle}>Staff employment & pay</Text>
          <Text variant="bodySmall" style={styles.subtitle}>Current terms shown here are the same dated EmploymentEngagement records used by roster/timesheet payroll snapshots.</Text>
        </View>

        {!loading && staff.length === 0 && <Card><Card.Content><Text>No eligible staff are available for this pharmacy.</Text></Card.Content></Card>}

        {staff.map(row => {
          const engagement = currentEngagementByMembership.get(row.membership_id);
          return <Card key={row.membership_id}><Card.Content>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium" style={styles.strong}>{row.worker_name}</Text>
                <Text variant="bodySmall">{pretty(row.role)} · {pretty(row.employment_type)}</Text>
              </View>
              {engagement ? <Chip compact>{engagement.pay_basis === 'ABOVE_AWARD' ? 'Above award' : 'Award'}</Chip> : <Chip compact>Terms missing</Chip>}
            </View>

            <View style={styles.hoursRow}>
              <TextInput
                mode="outlined"
                dense
                keyboardType="decimal-pad"
                label="Contracted h/week"
                value={hoursDraft[row.membership_id] ?? ''}
                onChangeText={value => setHoursDraft(current => ({ ...current, [row.membership_id]: value }))}
                style={{ flex: 1 }}
              />
              <Button mode="outlined" loading={busyKey === `hours-${row.membership_id}`} disabled={busyKey != null} onPress={() => void saveHours(row)}>Save</Button>
            </View>

            {engagement ? <View style={styles.termBox}>
              <Text variant="labelLarge">{pretty(engagement.award_classification)}</Text>
              <Text variant="bodySmall">{engagement.effective_from} → {engagement.effective_to || 'Current'} · {engagement.correspondence?.label || 'Employment terms'}</Text>
              <View style={styles.rateGrid}>
                <View><Text variant="labelSmall">Weekday</Text><Text>${engagement.rate_weekday}/hr</Text></View>
                <View><Text variant="labelSmall">Saturday</Text><Text>${engagement.rate_saturday}/hr</Text></View>
                <View><Text variant="labelSmall">Sunday</Text><Text>${engagement.rate_sunday}/hr</Text></View>
                <View><Text variant="labelSmall">Public holiday</Text><Text>${engagement.rate_public_holiday}/hr</Text></View>
              </View>
              {(engagement.rate_early_morning || engagement.rate_late_night) && <Text variant="bodySmall" style={{ marginTop: 8 }}>Early {engagement.rate_early_morning ? `$${engagement.rate_early_morning}/hr` : '—'} · Late {engagement.rate_late_night ? `$${engagement.rate_late_night}/hr` : '—'}</Text>}
            </View> : <Card style={styles.warning}><Card.Content><Text variant="bodySmall">No current dated EmploymentEngagement. If ChemistTasker Payroll is enabled, this worker must have valid employment/pay terms before payroll-routed roster assignment.</Text></Card.Content></Card>}
          </Card.Content></Card>;
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7FAFF' },
  content: { padding: 18, gap: 14, paddingBottom: 48 },
  title: { fontWeight: '900', color: '#06214A' },
  subtitle: { color: '#52617A', marginTop: 4 },
  sectionTitle: { fontWeight: '800', color: '#06214A' },
  chips: { gap: 8, paddingVertical: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  strong: { fontWeight: '800' },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  termBox: { marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: '#F8FAFC' },
  rateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  warning: { marginTop: 12, backgroundColor: '#FFF7ED' },
  error: { backgroundColor: '#FFF1F0' },
  errorText: { color: '#B42318' },
});
