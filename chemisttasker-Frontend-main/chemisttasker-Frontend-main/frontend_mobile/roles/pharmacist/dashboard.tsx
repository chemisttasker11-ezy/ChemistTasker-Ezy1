import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { Text, Card, Surface, IconButton, Chip, Divider, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import getShiftPharmacyName from '@/roles/shared/shifts/utils/getShiftPharmacyName';
import HomeNavigationGrid from '@/components/HomeNavigationGrid';
import {
  DashboardActivity,
  DashboardErrorState,
  DashboardLoadingState,
  DashboardPersonaSwitcher,
  DashboardScopeSwitcher,
  DashboardStatsOverview,
  type DashboardPayload,
  useScopedDashboard,
} from '@/roles/shared/dashboard/dashboardScope';

const { width } = Dimensions.get('window');

type ShiftSummary = {
  id: number;
  pharmacy_name?: string;
  pharmacyName?: string;
  date?: string;
  start_datetime?: string;
  startDatetime?: string;
  status?: string;
  role?: string;
};

function formatShiftDate(value?: string | null) {
  if (!value) return 'No date provided';
  const normalized = value.replace('T', ' ').replace('Z', '');
  // Try to make it look nicer if possible, similar to owner dashboard
  try {
    const date = new Date(normalized);
    return date.toLocaleString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return normalized;
  }
}

export default function PharmacistOverviewScreen() {
  const { access, user, logout, isLoading: authLoading } = useAuth();
  const scope = useScopedDashboard('PHARMACIST');
  const router = useRouter();

  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  const normalizedRole = String(user?.role || '').toUpperCase();

  const loadDashboard = useCallback(async () => {
    if (normalizedRole !== 'PHARMACIST' || !access) {
      return;
    }
    // If not refreshing, we might want to show loading initially
    if (!refreshing) setLoading(true);
    try {
      const result = await scope.fetchDashboard();
      setData(result as any);
      setErrorMessage(null);

      // Animate in
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    } catch (err: any) {
      console.error('Unable to load dashboard', err);
      setData(null);
      setErrorMessage(
        err?.response?.status === 403
          ? 'You no longer have access to that pharmacy scope. The dashboard scope has been reset.'
          : err?.response?.data?.detail || 'Unable to load dashboard analytics right now.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [normalizedRole, access, refreshing, fadeAnim, slideAnim, scope.fetchDashboard]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (normalizedRole !== 'PHARMACIST') {
      setLoading(false);
      return;
    }
    if (!access) {
      setLoading(true);
      return;
    }
    void loadDashboard();
  }, [loadDashboard, normalizedRole, access, authLoading]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDashboard();
  }, [loadDashboard]);

  const shifts = useMemo(() => data?.shifts ?? [], [data?.shifts]);
  const displayName =
    data?.user?.first_name ||
    data?.user?.username ||
    (user as any)?.first_name ||
    (user as any)?.username ||
    'there';

  const statCards = useMemo(() => [
    {
      label: 'Community Opportunities',
      value: data?.community_shifts_count ?? 0,
      icon: 'briefcase-search',
      color: '#F59E0B',
      trend: 'New',
      trendUp: true
    },
    {
      label: 'Points Earned',
      value: data?.bills_summary?.points ?? '0',
      icon: 'star',
      color: '#EC4899',
      trend: 'Total',
      trendUp: true
    },
    {
      label: 'Total Income This Month',
      value: data?.invoice_summary?.total_billed ?? data?.bills_summary?.total_billed ?? '$0.00',
      icon: 'cash',
      color: '#10B981',
      trend: 'This Month',
      trendUp: true
    },
  ], [data]);

  const quickActions = useMemo(() => [
    {
      title: 'Find Shifts',
      description: 'Browse jobs',
      icon: 'magnify',
      route: '/pharmacist/shifts',
    },
    {
      title: 'Publish Availability',
      description: 'Post available times',
      icon: 'calendar-plus-outline',
      route: '/pharmacist/publish-availability',
    },
    {
      title: 'Availability',
      description: 'Set schedule',
      icon: 'calendar-clock-outline',
      route: '/pharmacist/availability',
    },
    {
      title: 'Memberships',
      description: 'Manage pharmacies',
      icon: 'store-cog-outline',
      route: '/pharmacist/memberships',
    },
    {
      title: 'Calendar',
      description: 'View schedule',
      icon: 'calendar-outline',
      route: '/pharmacist/calendar',
    },
    {
      title: 'Talent Board',
      description: 'Browse talent',
      icon: 'account-search-outline',
      route: '/pharmacist/talent-board',
    },
    {
      title: 'Invoices',
      description: 'View payments',
      icon: 'file-document-outline',
      route: '/pharmacist/invoice',
    },
    { title: 'Hub', description: 'Community posts', icon: 'view-grid-outline', route: '/pharmacist/hub' },
    { title: 'Chat', description: 'Open messages', icon: 'message-text-outline', route: '/pharmacist/chat' },
    { title: 'Learning', description: 'Training', icon: 'school-outline', route: '/pharmacist/learning' },
    { title: 'Interests', description: 'Preferences', icon: 'heart-outline', route: '/pharmacist/interests' },
    { title: 'Notifications', description: 'Alerts', icon: 'bell-outline', route: '/pharmacist/notifications' },
    {
      title: 'Profile',
      description: 'Edit details',
      icon: 'account-circle-outline',
      route: '/pharmacist/profile',
    },
  ], []);

  if (loading && !refreshing && !data) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <DashboardLoadingState />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
        showsVerticalScrollIndicator={false}
      >
        <DashboardPersonaSwitcher role="PHARMACIST" />
        <DashboardScopeSwitcher
          pharmacies={scope.pharmacies}
          scopeLabel={scope.scopeLabel}
          workspace={scope.workspace}
          selectedPharmacyId={scope.selectedPharmacyId}
          canSelectPlatform={scope.canSelectPlatform}
          onSelectPlatform={scope.selectPlatform}
          onSelectPharmacy={scope.selectPharmacy}
        />
        {errorMessage ? <DashboardErrorState message={errorMessage} onRetry={loadDashboard} /> : null}
        {/* Header */}
        {/* Stats Grid */}
        {/* <View style={styles.statsContainer}>
          <View style={styles.sectionHeader}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Overview
            </Text>
          </View>
          <View style={styles.statsGrid}>
            {statCards.map((stat) => (
              <Animated.View
                key={stat.label}
                style={{ opacity: fadeAnim, transform: [{ scale: fadeAnim }] }}
              >
                <Card style={styles.statCard}>
                  <Card.Content style={styles.statCardContent}>
                    <View style={styles.statCardHeader}>
                      <View style={[styles.statIcon, { backgroundColor: `${stat.color}15` }]}>
                        <IconButton icon={stat.icon} size={20} iconColor={stat.color} />
                      </View>
                      <Chip
                        style={[styles.trendChip, { backgroundColor: stat.trendUp ? '#D1FAE5' : '#FEE2E2' }]}
                        textStyle={[styles.trendText, { color: stat.trendUp ? '#059669' : '#DC2626' }]}
                        compact
                      >
                        {stat.trend}
                      </Chip>
                    </View>
                    <Text variant="headlineSmall" style={styles.statValue}>
                      {stat.value}
                    </Text>
                    <Text variant="bodySmall" style={styles.statLabel}>
                      {stat.label}
                    </Text>
                  </Card.Content>
                </Card>
              </Animated.View>
            ))}
          </View>
        </View> */}

        <LinearGradient colors={['#267DB8', '#433894', '#9A087D']} locations={[0, 0.58, 1]} start={{ x: 0, y: 0.1 }} end={{ x: 1, y: 1 }} style={styles.shiftHero}>
          <View pointerEvents="none" style={styles.heroAngleOne} />
          <View pointerEvents="none" style={styles.heroAngleTwo} />
          <Text variant="headlineSmall" style={styles.shiftHeroTitle}>Welcome {displayName},</Text>
          <View style={styles.shiftHeroHeader}>
            <Text variant="titleMedium" style={styles.shiftHeroSubtitle}>Upcoming shifts</Text>
            <TouchableOpacity onPress={() => router.push('/pharmacist/shifts')}>
              <Text style={styles.shiftHeroLink}>View all</Text>
            </TouchableOpacity>
          </View>
          {shifts.length > 0 ? (
            shifts.slice(0, 3).map((shift) => (
              <Card key={shift.id} style={styles.shiftPreviewCard} onPress={() => router.push(`/pharmacist/shifts/${shift.id}` as any)}>
                <Card.Content style={styles.shiftPreviewContent}>
                  <View style={styles.shiftPreviewLeft}>
                    <View style={styles.shiftIconContainer}>
                      <IconButton icon="calendar-clock" size={20} iconColor="#6366F1" />
                    </View>
                    <View>
                      <Text variant="labelMedium" style={styles.shiftPharmacyName}>
                      {getShiftPharmacyName(shift)}
                      </Text>
                      <Text variant="bodySmall" style={styles.shiftRole}>
                        {formatShiftDate(shift.date || shift.startDatetime || shift.start_datetime)}
                      </Text>
                    </View>
                  </View>
                  <IconButton icon="chevron-right" size={20} iconColor="#9CA3AF" />
                </Card.Content>
              </Card>
            ))
          ) : (
            <View style={styles.shiftHeroEmpty}>
              <IconButton icon="calendar-blank" size={40} iconColor="rgba(255,255,255,0.86)" />
              <Text variant="titleMedium" style={styles.shiftHeroEmptyTitle}>No upcoming shifts</Text>
              <Text variant="bodySmall" style={styles.shiftHeroEmptyText}>Check the community board to find new opportunities.</Text>
              <Button mode="contained" buttonColor="#FFFFFF" textColor="#1D4ED8" style={styles.shiftHeroButton} onPress={() => router.push('/pharmacist/shifts')}>
                Find Shifts
              </Button>
            </View>
          )}
        </LinearGradient>

        <DashboardStatsOverview data={data} />

        <LinearGradient colors={['#267DB8', '#433894', '#9A087D']} locations={[0, 0.58, 1]} start={{ x: 0, y: 0.1 }} end={{ x: 1, y: 1 }} style={styles.billingHero}>
          <View pointerEvents="none" style={styles.heroAngleOne} />
          <View pointerEvents="none" style={styles.heroAngleTwo} />
          <Text variant="labelMedium" style={styles.billingEyebrow}>Invoices</Text>
          <View style={styles.billingRow}>
            <View>
              <Text variant="headlineSmall" style={styles.billingValue}>{data?.invoice_summary?.total_billed ?? data?.bills_summary?.total_billed ?? '$0.00'}</Text>
              <Text variant="bodySmall" style={styles.billingText}>Total income this month</Text>
              <View style={styles.billingMetaRow}>
                <View style={styles.billingMetaItem}>
                  <Text style={styles.billingMetaValue}>{data?.invoice_summary?.unpaid_count ?? 0}</Text>
                  <Text style={styles.billingMetaLabel}>Unpaid invoices</Text>
                </View>
                <View style={styles.billingMetaItem}>
                  <Text style={styles.billingMetaValue}>{data?.invoice_summary?.unpaid_total ?? '$0.00'}</Text>
                  <Text style={styles.billingMetaLabel}>Unpaid total</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.billingButton} onPress={() => router.push('/pharmacist/invoice' as any)}>
              <Text style={styles.billingButtonText}>Invoices</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <HomeNavigationGrid items={quickActions} onNavigate={(route) => router.push(route as any)} />

        <DashboardActivity data={data} />

        {/* Bottom Menu */}
        <Surface style={styles.bottomSection}>
          <TouchableOpacity style={styles.bottomMenuItem} onPress={() => router.push('/pharmacist/profile')}>
            <View style={styles.bottomMenuIcon}>
              <IconButton icon="account-cog" size={24} iconColor="#6366F1" />
            </View>
            <View style={styles.bottomMenuContent}>
              <Text variant="labelLarge" style={styles.bottomMenuTitle}>
                Account Settings
              </Text>
              <Text variant="bodySmall" style={styles.bottomMenuDesc}>
                Manage your profile and preferences
              </Text>
            </View>
            <IconButton icon="chevron-right" size={20} iconColor="#9CA3AF" />
          </TouchableOpacity>

          <Divider />

          <TouchableOpacity style={styles.bottomMenuItem} onPress={() => router.push('/contact' as any)}>
            <View style={styles.bottomMenuIcon}>
              <IconButton icon="help-circle" size={24} iconColor="#10B981" />
            </View>
            <View style={styles.bottomMenuContent}>
              <Text variant="labelLarge" style={styles.bottomMenuTitle}>
                Help & Support
              </Text>
              <Text variant="bodySmall" style={styles.bottomMenuDesc}>
                Get assistance and view FAQs
              </Text>
            </View>
            <IconButton icon="chevron-right" size={20} iconColor="#9CA3AF" />
          </TouchableOpacity>

          <Divider />

          <TouchableOpacity
            style={styles.bottomMenuItem}
            onPress={async () => {
              await logout();
              router.replace('/login' as any);
            }}
          >
            <View style={[styles.bottomMenuIcon, { backgroundColor: '#FEE2E2' }]}>
              <IconButton icon="logout" size={24} iconColor="#DC2626" />
            </View>
            <View style={styles.bottomMenuContent}>
              <Text variant="labelLarge" style={[styles.bottomMenuTitle, { color: '#DC2626' }]}>
                Sign Out
              </Text>
              <Text variant="bodySmall" style={styles.bottomMenuDesc}>
                Logout from your account
              </Text>
            </View>
            <IconButton icon="chevron-right" size={20} iconColor="#9CA3AF" />
          </TouchableOpacity>
        </Surface>

      </ScrollView>
    </SafeAreaView>
  );
}

// Reusing styles from Owner Dashboard for consistency
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#6B7280',
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingText: {
    color: '#6B7280',
    marginBottom: 4,
    fontSize: 14,
  },
  nameText: {
    fontWeight: 'bold',
    color: '#111827',
    fontSize: 28,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  workspacePill: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  workspaceLabel: { color: '#6B7280', fontSize: 11 },
  workspaceValue: { color: '#111827', fontWeight: '700', fontSize: 12 },
  iconButton: {
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#EF4444',
  },
  avatar: {
    backgroundColor: '#6366F1',
  },
  avatarLabel: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  heroCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  gradientCard: {
    padding: 24,
  },
  heroContent: {
    gap: 20,
  },
  heroStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  heroStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  heroStatValue: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 44,
    lineHeight: 52,
  },
  heroStatLabel: {
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
    fontSize: 13,
  },
  heroDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  heroButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  heroButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  heroButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
    marginLeft: -8,
  },
  statsContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontWeight: '700',
    color: '#111827',
    fontSize: 18,
  },
  seeAllText: {
    color: '#6366F1',
    fontWeight: '600',
    fontSize: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'center',
  },
  statCard: {
    width: 180,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  statCardContent: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  statCardHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendChip: {
    height: 24,
  },
  trendText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statValue: {
    fontWeight: 'bold',
    color: '#111827',
    fontSize: 26,
  },
  statLabel: {
    color: '#6B7280',
    fontSize: 13,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  shiftHero: {
    marginHorizontal: 20,
    marginBottom: 18,
    borderRadius: 22,
    padding: 18,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    position: 'relative',
  },
  heroAngleOne: { position: 'absolute', top: -58, left: 158, width: 150, height: 310, backgroundColor: 'rgba(255,255,255,0.16)', transform: [{ rotate: '-28deg' }] },
  heroAngleTwo: { position: 'absolute', right: -50, bottom: -70, width: 230, height: 300, backgroundColor: 'rgba(255,255,255,0.08)', transform: [{ rotate: '30deg' }] },
  shiftHeroTitle: {
    color: '#FFFFFF',
    fontWeight: '900',
    marginBottom: 10,
  },
  shiftHeroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  shiftHeroSubtitle: {
    color: '#E0F2FE',
    fontWeight: '800',
  },
  shiftHeroLink: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  shiftHeroEmpty: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  shiftHeroEmptyTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    marginTop: 2,
  },
  shiftHeroEmptyText: {
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
    marginTop: 4,
  },
  shiftHeroButton: {
    marginTop: 14,
    borderRadius: 999,
  },
  billingHero: {
    marginHorizontal: 20,
    marginBottom: 18,
    borderRadius: 22,
    padding: 18,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    position: 'relative',
  },
  billingEyebrow: {
    color: 'rgba(255,255,255,0.72)',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  billingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  billingValue: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  billingText: {
    color: 'rgba(255,255,255,0.78)',
    marginTop: 2,
  },
  billingMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  billingMetaItem: {
    minWidth: 118,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  billingMetaValue: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
  },
  billingMetaLabel: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 11,
    marginTop: 2,
  },
  billingButton: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  billingButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  sectionHeaderText: {
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
    fontSize: 18,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'center',
  },
  quickActionCard: {
    width: (width - 64) / 2,
    alignItems: 'center',
    gap: 8,
  },
  quickActionGradient: {
    width: 64,
    height: 64,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  quickActionTitle: {
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    fontSize: 12,
  },
  quickActionDesc: {
    color: '#6B7280',
    textAlign: 'center',
    fontSize: 10,
  },
  shiftPreviewCard: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  shiftPreviewContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  shiftPreviewLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  shiftIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shiftPharmacyName: {
    color: '#111827',
    fontWeight: '600',
  },
  shiftRole: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
  bottomSection: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  bottomMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  bottomMenuIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomMenuContent: {
    flex: 1,
    marginLeft: 12,
  },
  bottomMenuTitle: {
    color: '#111827',
    fontWeight: '600',
  },
  bottomMenuDesc: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
  emptyCard: {
    borderRadius: 16,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
});



