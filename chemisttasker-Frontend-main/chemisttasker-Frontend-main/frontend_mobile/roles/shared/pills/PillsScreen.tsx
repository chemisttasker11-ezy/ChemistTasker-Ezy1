import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip, Divider, Surface, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import apiClient from '@/utils/apiClient';

type PillBalance = {
  balance: number;
  shift_post_cost: number;
};

type PillLedgerEntry = {
  id: number;
  entry_type: string;
  source: string;
  delta: number;
  balance_after: number;
  description: string;
  rule_code?: string | null;
  referral_type?: string | null;
  shift_id?: number | null;
  created_at: string;
};

type PillReferralEvent = {
  id: number;
  referral_type: string;
  status: string;
  referred_user_email?: string | null;
  referred_email?: string | null;
  shift_id?: number | null;
  created_at: string;
};

const formatSource = (source?: string) =>
  String(source || 'PILL_ACTIVITY')
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const formatDate = (value?: string) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
};

const ACTIVITY_PAGE_SIZE = 10;

export default function PillsScreen() {
  const params = useLocalSearchParams<{ pharmacyId?: string }>();
  const pharmacyId = typeof params.pharmacyId === 'string' ? params.pharmacyId : null;
  const [balance, setBalance] = useState<PillBalance>({ balance: 0, shift_post_cost: 0 });
  const [entries, setEntries] = useState<PillLedgerEntry[]>([]);
  const [referrals, setReferrals] = useState<PillReferralEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activityPage, setActivityPage] = useState(1);

  const loadPills = useCallback(async () => {
    setRefreshing(true);
    setError('');
    try {
      const [balanceRes, historyRes, referralRes] = await Promise.all([
        apiClient.get('/client-profile/pill-rewards/balance/'),
        apiClient.get('/client-profile/pill-rewards/history/'),
        apiClient.get('/client-profile/pill-rewards/referrals/'),
      ]);
      setBalance({
        balance: Number(balanceRes.data?.balance ?? 0),
        shift_post_cost: Number(balanceRes.data?.shift_post_cost ?? 0),
      });
      const rawEntries = Array.isArray(historyRes.data?.results)
        ? historyRes.data.results
        : Array.isArray(historyRes.data)
          ? historyRes.data
          : [];
      setEntries(rawEntries);
      const rawReferrals = Array.isArray(referralRes.data?.results)
        ? referralRes.data.results
        : Array.isArray(referralRes.data)
          ? referralRes.data
          : [];
      setReferrals(rawReferrals);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load pill activity.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPills();
  }, [loadPills]);

  const earned = useMemo(
    () => entries.filter((entry) => entry.delta > 0).reduce((sum, entry) => sum + entry.delta, 0),
    [entries]
  );
  const spent = useMemo(
    () => Math.abs(entries.filter((entry) => entry.delta < 0).reduce((sum, entry) => sum + entry.delta, 0)),
    [entries]
  );
  const pendingReferrals = useMemo(
    () => referrals.filter((event) => event.status === 'CLAIMED'),
    [referrals]
  );
  const sharedReferralLinks = useMemo(
    () => referrals.filter((event) => event.status === 'PENDING' && !event.referred_user_email),
    [referrals]
  );
  const sharedShiftLinks = useMemo(
    () => sharedReferralLinks.filter((event) => event.referral_type === 'SHIFT'),
    [sharedReferralLinks]
  );
  const sharedFriendLinks = useMemo(
    () => sharedReferralLinks.filter((event) => event.referral_type === 'FRIEND'),
    [sharedReferralLinks]
  );
  const awardedReferrals = useMemo(
    () => referrals.filter((event) => event.status === 'AWARDED'),
    [referrals]
  );
  const latestSharedLink = sharedReferralLinks[0];
  const activityPageCount = Math.ceil(entries.length / ACTIVITY_PAGE_SIZE);
  const visibleEntries = useMemo(
    () => entries.slice((activityPage - 1) * ACTIVITY_PAGE_SIZE, activityPage * ACTIVITY_PAGE_SIZE),
    [activityPage, entries]
  );

  useEffect(() => {
    if (activityPage > Math.max(activityPageCount, 1)) {
      setActivityPage(1);
    }
  }, [activityPage, activityPageCount]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadPills} tintColor="#6366F1" />}
        showsVerticalScrollIndicator={false}
      >
        <Surface style={styles.heroSurface}>
          <LinearGradient colors={['#4F46E5', '#0EA5E9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroGradient}>
            <View style={styles.heroText}>
              <Text variant="labelMedium" style={styles.eyebrow}>
                Pill rewards
              </Text>
              <View style={styles.balanceRow}>
                <Text variant="displaySmall" style={styles.balanceValue}>
                  {loading ? '...' : balance.balance}
                </Text>
                <Text variant="titleMedium" style={styles.balanceLabel}>
                  pills
                </Text>
              </View>
              <Text variant="bodySmall" style={styles.heroDescription}>
                A readable summary of every action that added or used pills for shift posting.
              </Text>
              {pharmacyId ? (
                <Text variant="bodySmall" style={styles.heroContext}>
                  Admin pharmacy context: Pharmacy #{pharmacyId}
                </Text>
              ) : null}
              <View style={styles.heroChips}>
                <Chip compact style={styles.heroChip} textStyle={styles.heroChipText}>
                  {earned} earned
                </Chip>
                <Chip compact style={styles.heroChip} textStyle={styles.heroChipText}>
                  {spent} spent
                </Chip>
              </View>
            </View>
            <Image source={require('@/assets/images/drugs.png')} style={styles.heroImage} resizeMode="contain" />
          </LinearGradient>
        </Surface>

        <View style={styles.rateRow}>
          <Surface style={styles.rateCard}>
            <Text variant="labelMedium" style={styles.rateLabel}>
              Shift post cost
            </Text>
            <Text variant="headlineSmall" style={styles.rateValue}>
              {balance.shift_post_cost}
            </Text>
            <Text variant="bodySmall" style={styles.rateHelp}>
              pills
            </Text>
          </Surface>
          <Surface style={styles.rateCard}>
            <Text variant="labelMedium" style={styles.rateLabel}>
              Current balance
            </Text>
            <Text variant="headlineSmall" style={styles.rateValue}>
              {balance.balance}
            </Text>
            <Text variant="bodySmall" style={styles.rateHelp}>
              pills
            </Text>
          </Surface>
        </View>

        {error ? (
          <Surface style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </Surface>
        ) : null}

        <Surface style={styles.activityCard}>
          <View style={styles.activityHeader}>
            <Text variant="titleMedium" style={styles.activityTitle}>
              Referral Pipeline
            </Text>
            <Text variant="bodySmall" style={styles.activitySubtitle}>
              Shared links, registrations waiting for verification, and completed rewards.
            </Text>
          </View>
          <Divider />
          {loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Loading referral summary...</Text>
            </View>
          ) : (
            <View style={styles.pipelineBody}>
              <View style={styles.pipelineGrid}>
                {[
                  ['Shift links', sharedShiftLinks.length],
                  ['Friend links', sharedFriendLinks.length],
                  ['Waiting', pendingReferrals.length],
                  ['Awarded', awardedReferrals.length],
                ].map(([label, value]) => (
                  <View key={String(label)} style={styles.pipelineStat}>
                    <Text style={styles.pipelineValue}>{value}</Text>
                    <Text style={styles.pipelineLabel}>{label}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.pipelineLatest}>
                {latestSharedLink
                  ? `Latest shared link: ${
                      latestSharedLink.referral_type === 'SHIFT' ? 'shift' : 'friend'
                    } referral${
                      latestSharedLink.shift_id ? ` for Shift #${latestSharedLink.shift_id}` : ''
                    }, created ${formatDate(latestSharedLink.created_at)}.`
                  : 'No referral links have been created yet.'}
              </Text>
            </View>
          )}
        </Surface>

        <Surface style={styles.activityCard}>
          <View style={styles.activityHeader}>
            <Text variant="titleMedium" style={styles.activityTitle}>
              Pending Referrals
            </Text>
            <Text variant="bodySmall" style={styles.activitySubtitle}>
              Registered referrals waiting for profile verification.
            </Text>
          </View>
          <Divider />
          {loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Loading referrals...</Text>
            </View>
          ) : pendingReferrals.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No pending referrals.</Text>
              <Text style={styles.emptyText}>No registered referrals are waiting for verification.</Text>
            </View>
          ) : (
            pendingReferrals.map((event, index) => (
              <View key={event.id}>
                <View style={styles.entryRow}>
                  <View style={styles.entryCopy}>
                    <Text variant="labelLarge" style={styles.entryTitle}>
                      {event.referral_type === 'SHIFT' ? 'Shift referral' : 'Friend referral'}
                      {event.shift_id ? ` - Shift #${event.shift_id}` : ''}
                    </Text>
                    <Text variant="bodySmall" style={styles.entryMeta}>
                      {event.referred_user_email || event.referred_email || 'Registered user waiting for verification'}
                    </Text>
                    <Text variant="bodySmall" style={styles.entryDate}>
                      {formatDate(event.created_at)}
                    </Text>
                  </View>
                  <Chip compact>waiting</Chip>
                </View>
                {index < pendingReferrals.length - 1 ? <Divider /> : null}
              </View>
            ))
          )}
        </Surface>

        <Surface style={styles.activityCard}>
          <View style={styles.activityHeader}>
            <Text variant="titleMedium" style={styles.activityTitle}>
              Pill Activity
            </Text>
            <Text variant="bodySmall" style={styles.activitySubtitle}>
              Each referral and pill payment appears here.
            </Text>
          </View>
          <Divider />
          {loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Loading pill activity...</Text>
            </View>
          ) : entries.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No pill activity yet.</Text>
              <Text style={styles.emptyText}>Referrals and future pill payments will appear here.</Text>
            </View>
          ) : (
            visibleEntries.map((entry, index) => (
              <View key={entry.id}>
                <View style={styles.entryRow}>
                  <View style={styles.entryCopy}>
                    <Text variant="labelLarge" style={styles.entryTitle}>
                      {entry.description || formatSource(entry.source)}
                    </Text>
                    <Text variant="bodySmall" style={styles.entryMeta}>
                      {formatSource(entry.source)}
                      {entry.shift_id ? ` - Shift #${entry.shift_id}` : ''}
                    </Text>
                    <Text variant="bodySmall" style={styles.entryDate}>
                      {formatDate(entry.created_at)}
                    </Text>
                  </View>
                  <View style={styles.entryAmount}>
                    <Text style={[styles.entryDelta, entry.delta >= 0 ? styles.entryDeltaEarned : styles.entryDeltaSpent]}>
                      {entry.delta >= 0 ? '+' : ''}
                      {entry.delta}
                    </Text>
                    <Text style={styles.entryBalance}>After {entry.balance_after}</Text>
                  </View>
                </View>
                {index < visibleEntries.length - 1 ? <Divider /> : null}
              </View>
            ))
          )}
          {!loading && entries.length > ACTIVITY_PAGE_SIZE ? (
            <View style={styles.paginationRow}>
              <Button
                mode="outlined"
                compact
                disabled={activityPage <= 1}
                onPress={() => setActivityPage((page) => Math.max(1, page - 1))}
              >
                Previous
              </Button>
              <Text style={styles.paginationText}>
                {activityPage} / {activityPageCount}
              </Text>
              <Button
                mode="outlined"
                compact
                disabled={activityPage >= activityPageCount}
                onPress={() => setActivityPage((page) => Math.min(activityPageCount, page + 1))}
              >
                Next
              </Button>
            </View>
          ) : null}
        </Surface>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 32 },
  heroSurface: {
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
  },
  heroGradient: {
    minHeight: 210,
    padding: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroText: { flex: 1, paddingRight: 8 },
  eyebrow: {
    color: 'rgba(255, 255, 255, 0.78)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  balanceValue: { color: '#FFFFFF', fontWeight: '900', lineHeight: 48 },
  balanceLabel: { color: 'rgba(255, 255, 255, 0.9)', fontWeight: '700' },
  heroDescription: { color: 'rgba(255, 255, 255, 0.9)', marginTop: 8, maxWidth: 230 },
  heroContext: { color: 'rgba(255, 255, 255, 0.82)', marginTop: 6, maxWidth: 230 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  heroChip: { backgroundColor: 'rgba(255, 255, 255, 0.18)' },
  heroChipText: { color: '#FFFFFF', fontWeight: '700', fontSize: 11 },
  heroImage: { width: 136, height: 136, marginRight: -10 },
  rateRow: { flexDirection: 'row', gap: 12, marginTop: 18 },
  rateCard: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  rateLabel: { color: '#6B7280', marginBottom: 8 },
  rateValue: { color: '#111827', fontWeight: '900' },
  rateHelp: { color: '#6B7280' },
  errorBox: { backgroundColor: '#FEE2E2', borderRadius: 14, padding: 14, marginTop: 18 },
  errorText: { color: '#B91C1C', fontWeight: '600' },
  activityCard: {
    marginTop: 18,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  activityHeader: { padding: 18 },
  activityTitle: { color: '#111827', fontWeight: '800' },
  activitySubtitle: { color: '#6B7280', marginTop: 4 },
  emptyState: { padding: 24 },
  emptyTitle: { color: '#111827', fontWeight: '700' },
  emptyText: { color: '#6B7280', marginTop: 4 },
  entryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, padding: 16 },
  entryCopy: { flex: 1, minWidth: 0 },
  entryTitle: { color: '#111827', fontWeight: '800' },
  entryMeta: { color: '#6B7280', marginTop: 3 },
  entryDate: { color: '#9CA3AF', marginTop: 4 },
  entryAmount: { alignItems: 'flex-end', justifyContent: 'center' },
  entryDelta: { fontWeight: '900', fontSize: 18 },
  entryDeltaEarned: { color: '#059669' },
  entryDeltaSpent: { color: '#DC2626' },
  entryBalance: { color: '#6B7280', fontSize: 11, marginTop: 4 },
  pipelineBody: { padding: 16 },
  pipelineGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pipelineStat: {
    width: '48%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
  },
  pipelineValue: { color: '#111827', fontWeight: '900', fontSize: 22 },
  pipelineLabel: { color: '#6B7280', marginTop: 3, fontSize: 12 },
  pipelineLatest: { color: '#6B7280', marginTop: 12, lineHeight: 18 },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  paginationText: { color: '#374151', fontWeight: '700' },
});
