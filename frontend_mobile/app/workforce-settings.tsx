import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, List, Switch, Text, TextInput } from 'react-native-paper';
import { BrandActivityIndicator as ActivityIndicator } from '@/components/ui/BrandActivityIndicator';
import {
  canManageKioskDevices,
  fetchPharmaciesService,
  type WorkforceEmploymentEngagement,
  type WorkforcePayrollConfiguration,
  type WorkforceWorkSettings,
  workforce,
} from '@chemisttasker/shared-core';
import { colors, font, radius, space, touch } from '@/constants/tokens';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { orgCapabilities } from '@/roles/shared/dashboard/ManagerHome';
import { RootPageHeader } from '@/components/RootPageHeader';
import { useUnsavedChangesGuard } from '@/roles/shared/forms/useUnsavedChangesGuard';

const hours = (minutes?: number | null) => minutes == null ? '' : (minutes / 60).toFixed(2);
const pretty = (value?: string | null) => String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());

export default function WorkforceSettingsScreen() {
  const { user } = useAuth();
  const { selectedPharmacyId, isLoading: workspaceLoading } = useWorkspace();
  const accountKey = user ? `${user.id ?? user.email ?? user.username ?? ''}:${user.role ?? ''}` : 'guest';
  return (
    <ScopedWorkforceSettings
      key={accountKey}
      user={user}
      preferredPharmacyId={selectedPharmacyId}
      workspaceLoading={workspaceLoading}
    />
  );
}

function ScopedWorkforceSettings({
  user,
  preferredPharmacyId,
  workspaceLoading,
}: {
  user: any;
  preferredPharmacyId?: number | null;
  workspaceLoading?: boolean;
}) {
  const router = useRouter();
  const { hasCapability } = useAuth();
  const organizationRights = orgCapabilities(user);
  const isOwner = user?.role === 'OWNER';

  const [pharmacyPickerOpen, setPharmacyPickerOpen] = useState(false);
  const [pharmacyQuery, setPharmacyQuery] = useState('');
  const [pharmacyId, setPharmacyId] = useState<number | null>(null);
  const [pharmacies, setPharmacies] = useState<{ id: number; name: string }[]>([]);
  const [payroll, setPayroll] = useState<WorkforcePayrollConfiguration | null>(null);
  const [staff, setStaff] = useState<WorkforceWorkSettings[]>([]);
  const [engagements, setEngagements] = useState<WorkforceEmploymentEngagement[]>([]);
  const [hoursDraft, setHoursDraft] = useState<Record<number, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadedHoursRef = useRef<Record<number, string>>({});
  const requestGeneration = useRef(0);
  const inFlightLoadGeneration = useRef<number | null>(null);
  const currentPharmacy = useRef<number | null>(null);
  currentPharmacy.current = pharmacyId;
  const writeRef = useRef(false);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const unsaved = useUnsavedChangesGuard(hoursDraft, {
    saving: busyKey != null,
    title: 'Discard changes?',
    message: 'You have unsaved contracted hours. If you leave now, your edits will be discarded.',
    onDiscard: () => {
      setHoursDraft(loadedHoursRef.current);
    },
  });
  const markCleanRef = useRef(unsaved.markClean);
  markCleanRef.current = unsaved.markClean;

  const canManageRoster = Boolean(pharmacyId && (isOwner || organizationRights.roster || hasCapability('MANAGE_ROSTER', pharmacyId)));
  const canManageKiosk = Boolean(pharmacyId && canManageKioskDevices(user, pharmacyId));

  useEffect(() => {
    let active = true;
    if (!user) {
      setPharmacies([]);
      setPharmacyId(null);
      setError('');
      setLoading(false);
      return;
    }
    if (workspaceLoading) {
      return;
    }
    setError('');
    fetchPharmaciesService({})
      .then((data: any[]) => {
        if (!active) return;
        const mapped = (data || []).map(row => ({ id: Number(row.id), name: row.name || `Pharmacy #${row.id}` }));
        setPharmacies(mapped);
        if (!mapped.length) setLoading(false);
        setPharmacyId(current => {
          if (current && mapped.some(row => row.id === current)) return current;
          if (preferredPharmacyId && mapped.some(row => row.id === preferredPharmacyId)) return preferredPharmacyId;
          return mapped[0]?.id ?? null;
        });
      })
      .catch((failure: any) => {
        if (!active) return;
        setError(failure?.message || 'Unable to load pharmacies.');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, preferredPharmacyId, workspaceLoading]);

  const load = useCallback(async (pull = false) => {
    if (writeRef.current || busyKey != null || inFlightLoadGeneration.current != null) return;
    // Save callbacks created for a previous pharmacy cannot replace the new
    // pharmacy's visible state after a workspace selection change.
    if (currentPharmacy.current !== pharmacyId) return;
    const generation = ++requestGeneration.current;
    inFlightLoadGeneration.current = generation;
    const current = () => isMountedRef.current && generation === requestGeneration.current && currentPharmacy.current === pharmacyId;
    if (!pharmacyId) {
      setPayroll(null); setStaff([]); setEngagements([]); setHoursDraft({});
      loadedHoursRef.current = {};
      markCleanRef.current({});
      if (!workspaceLoading) setLoading(false); setRefreshing(false);
      if (inFlightLoadGeneration.current === generation) inFlightLoadGeneration.current = null;
      return;
    }
    if (pull) setRefreshing(true);
    else {
      setLoading(true);
      setPayroll(null); setStaff([]); setEngagements([]); setHoursDraft({});
      loadedHoursRef.current = {};
      markCleanRef.current({});
    }
    setError('');
    try {
      const [nextPayroll, nextStaff, nextEngagements] = await Promise.all([
        workforce.getPayrollConfiguration(pharmacyId),
        workforce.listWorkSettings(pharmacyId),
        workforce.listEmploymentEngagements(pharmacyId),
      ]) as [WorkforcePayrollConfiguration, WorkforceWorkSettings[], WorkforceEmploymentEngagement[]];
      if (!current()) return;
      setPayroll(nextPayroll);
      setStaff(nextStaff);
      setEngagements(nextEngagements);
      const nextHours = Object.fromEntries(nextStaff.map(row => [row.membership_id, hours(row.contracted_weekly_minutes)]));
      loadedHoursRef.current = nextHours;
      setHoursDraft(nextHours);
      markCleanRef.current(nextHours);
    } catch (failure: any) {
      if (current()) setError(failure?.message || 'Unable to load workforce settings.');
    } finally {
      if (inFlightLoadGeneration.current === generation) {
        inFlightLoadGeneration.current = null;
      }
      if (current()) { setLoading(false); setRefreshing(false); }
    }
  }, [pharmacyId]);

  useEffect(() => {
    void load();
    return () => {
      requestGeneration.current += 1;
      inFlightLoadGeneration.current = null;
    };
  }, [load]);

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
    if (writeRef.current || busyKey != null || loading || refreshing || inFlightLoadGeneration.current != null) return;
    writeRef.current = true;
    const raw = (hoursDraft[row.membership_id] || '').trim();
    const numeric = raw === '' ? null : Number(raw);
    if (numeric != null && (!Number.isFinite(numeric) || numeric < 0 || numeric > 168)) {
      setError('Contracted hours must be between 0 and 168 hours per week.');
      writeRef.current = false;
      return;
    }
    setBusyKey(`hours-${row.membership_id}`); setError('');
    try {
      const saved = await workforce.saveWorkSettings({
        membership_id: row.membership_id,
        contracted_weekly_minutes: numeric == null ? null : Math.round(numeric * 60),
      });
      if (!isMountedRef.current || currentPharmacy.current !== pharmacyId) return;
      if (
        !saved ||
        saved.membership_id !== row.membership_id ||
        saved.contracted_weekly_minutes === undefined
      ) {
        throw new Error('Malformed server response when saving contracted hours.');
      }
      requestGeneration.current += 1;
      const savedMinutes = saved.contracted_weekly_minutes;
      const formatted = hours(savedMinutes);
      setStaff(current => current.map(item => item.membership_id === row.membership_id ? { ...item, ...saved, contracted_weekly_minutes: savedMinutes } : item));
      const nextBaseline = { ...loadedHoursRef.current, [row.membership_id]: formatted };
      loadedHoursRef.current = nextBaseline;
      setHoursDraft(current => ({ ...current, [row.membership_id]: formatted }));
      markCleanRef.current(nextBaseline);
    } catch (failure: any) {
      if (isMountedRef.current && currentPharmacy.current === pharmacyId) {
        setError(failure?.message || 'Unable to save contracted hours.');
      }
    } finally {
      writeRef.current = false;
      if (isMountedRef.current) {
        setBusyKey(null);
      }
    }
  };

  const togglePayroll = async (enabled: boolean) => {
    if (!pharmacyId || !payroll) return;
    if (writeRef.current || busyKey != null || loading || refreshing || inFlightLoadGeneration.current != null) return;
    writeRef.current = true;
    setBusyKey('payroll'); setError('');
    try {
      const next = await workforce.updatePayrollConfiguration({
        pharmacy_id: pharmacyId,
        use_chemisttasker_payroll: enabled,
      });
      if (!isMountedRef.current || currentPharmacy.current !== pharmacyId) return;
      requestGeneration.current += 1;
      if (next) setPayroll(next);
    } catch (failure: any) {
      if (isMountedRef.current && currentPharmacy.current === pharmacyId) {
        setError(failure?.message || 'Unable to update payroll configuration.');
      }
    } finally {
      writeRef.current = false;
      if (isMountedRef.current) {
        setBusyKey(null);
      }
    }
  };

  return (
    <>
      <RootPageHeader title="Workforce Settings" disabled={busyKey != null} />
      <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { if (writeRef.current || busyKey != null || loading || refreshing || inFlightLoadGeneration.current != null) return; unsaved.confirmDiscard(() => void load(true)); }} />} contentContainerStyle={styles.content}>
          <View>
            <Text variant="headlineMedium" style={styles.title}>Workforce settings</Text>
            <Text variant="bodyMedium" style={styles.subtitle}>Manage payroll, contracted hours and the employment terms recorded with rosters and timesheets.</Text>
          </View>

          {!!error && <Card style={styles.error}><Card.Content><Text style={styles.errorText}>{error}</Text></Card.Content></Card>}

          <Text variant="labelLarge">Pharmacy</Text>
          {pharmacyId != null && <Text variant="bodyMedium">Current: {pharmacies.find(pharmacy => pharmacy.id === pharmacyId)?.name}</Text>}
          <Button mode="outlined" icon={pharmacyPickerOpen ? "chevron-up" : "chevron-down"} disabled={busyKey != null || loading || refreshing} accessibilityState={{ expanded: pharmacyPickerOpen, disabled: busyKey != null || loading || refreshing }} onPress={() => setPharmacyPickerOpen(open => !open)}>
            {pharmacyId == null ? 'Choose pharmacy' : 'Change pharmacy'}
          </Button>
          {pharmacyPickerOpen && <View>
            <TextInput mode="outlined" label="Search pharmacies" value={pharmacyQuery} onChangeText={setPharmacyQuery} disabled={busyKey != null || loading || refreshing} />
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 240 }}>
              {pharmacies.filter(pharmacy => pharmacy.name.toLowerCase().includes(pharmacyQuery.toLowerCase())).map(pharmacy => (
                <List.Item key={pharmacy.id} title={() => <Text>{pharmacy.name}</Text>} left={pharmacyId === pharmacy.id ? props => <List.Icon {...props} icon="check" /> : undefined} accessibilityRole="radio" accessibilityState={{ checked: pharmacyId === pharmacy.id, disabled: busyKey != null || loading || refreshing }} disabled={busyKey != null || loading || refreshing} onPress={() => {
                  if (pharmacyId === pharmacy.id || busyKey != null || loading || refreshing) return;
                  unsaved.confirmDiscard(() => { setPharmacyId(pharmacy.id); setPharmacyPickerOpen(false); });
                }} />
              ))}
            </ScrollView>
          </View>}

          {loading ? <ActivityIndicator style={{ marginVertical: 24 }} /> : null}

          {payroll && <Card><Card.Content>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium" style={styles.strong}>Use ChemistTasker Payroll</Text>
                <Text variant="bodySmall">{payroll.use_chemisttasker_payroll ? 'TFN assignments can route to ChemistTasker Payroll when worker setup and employment terms are complete.' : 'Roster, attendance and timesheets stay active while payroll is processed externally.'}</Text>
              </View>
              <Switch disabled={busyKey != null || loading || refreshing} value={payroll.use_chemisttasker_payroll} onValueChange={value => void togglePayroll(value)} />
            </View>
            <View style={{ marginTop: 12, gap: 6 }}>
              <Text variant="bodySmall">ABN workers remain on invoice settlement.</Text>
              <Text variant="bodySmall">TFN workers remain timesheet-only until payroll requirements are complete.</Text>
            </View>
          </Card.Content></Card>}

          <View>
            <Text variant="titleMedium" style={styles.sectionTitle}>Staff employment & pay</Text>
            <Text variant="bodySmall" style={styles.subtitle}>Review employment terms and pay rates. Rosters and timesheets retain a record of the terms that apply to the work.</Text>
          </View>

          <Card style={styles.toolCard}>
            <Card.Content style={styles.toolContent}>
              <Text variant="titleMedium" style={styles.sectionTitle}>Related workforce tools</Text>
              <Text variant="bodySmall" style={styles.subtitle}>
                These tools use your active pharmacy workspace. Check the pharmacy selector when opening them.
              </Text>
              {canManageRoster ? <Button mode="outlined" icon="calendar-check" contentStyle={styles.toolButton} disabled={busyKey != null || loading || refreshing} onPress={() => unsaved.confirmDiscard(() => router.push('/manager/roster/coverage' as any))}>
                Coverage requirements
              </Button> : null}
              <Button mode="outlined" icon="file-document-edit-outline" contentStyle={styles.toolButton} disabled={busyKey != null || loading || refreshing} onPress={() => unsaved.confirmDiscard(() => router.push('/workforce/employment-engagements' as any))}>
                Edit employment terms
              </Button>
              {canManageKiosk ? <Button mode="outlined" icon="cellphone-key" contentStyle={styles.toolButton} disabled={busyKey != null || loading || refreshing} onPress={() => unsaved.confirmDiscard(() => router.push('/attendance/kiosk-status' as any))}>
                Kiosk & device management
              </Button> : null}
              {canManageRoster ? <Button mode="outlined" icon="file-export-outline" contentStyle={styles.toolButton} disabled={busyKey != null || loading || refreshing} onPress={() => unsaved.confirmDiscard(() => router.push('/workforce/payroll-export' as any))}>
                Payroll-ready export
              </Button> : null}
            </Card.Content>
          </Card>

          {!loading && !error && staff.length === 0 && <Card><Card.Content><Text>No eligible staff are available for this pharmacy.</Text></Card.Content></Card>}

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
                  editable={busyKey == null && !loading && !refreshing}
                  value={hoursDraft[row.membership_id] ?? ''}
                  onChangeText={value => {
                    if (writeRef.current || busyKey != null || loading || refreshing || inFlightLoadGeneration.current != null) return;
                    setHoursDraft(current => ({ ...current, [row.membership_id]: value }));
                  }}
                  style={{ flex: 1 }}
                />
                <Button mode="outlined" loading={busyKey === `hours-${row.membership_id}`} disabled={busyKey != null || loading || refreshing} onPress={() => void saveHours(row)}>Save</Button>
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
              </View> : <Card style={styles.warning}><Card.Content><Text variant="bodySmall">Employment terms are missing. Add current terms and pay rates before assigning this worker to shifts paid through ChemistTasker Payroll.</Text></Card.Content></Card>}
            </Card.Content></Card>;
          })}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: 18, gap: 14, paddingBottom: 48 },
  title: { fontFamily: font.outfit.medium, color: colors.brandNavy },
  subtitle: { color: colors.textSecondary, marginTop: space.xs },
  sectionTitle: { fontFamily: font.outfit.medium, color: colors.brandNavy },
  chips: { gap: 8, paddingVertical: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  strong: { fontWeight: '800' },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  termBox: { marginTop: space.md, padding: space.md, borderRadius: radius.nested, backgroundColor: colors.subtleBg },
  rateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  warning: { marginTop: space.md, backgroundColor: colors.status.amber.bg },
  error: { backgroundColor: colors.status.red.bg },
  errorText: { color: colors.status.red.fg },
  toolCard: { borderRadius: radius.card, backgroundColor: colors.surfaceBg },
  toolContent: { gap: space.sm },
  toolButton: { minHeight: touch.min },
});
