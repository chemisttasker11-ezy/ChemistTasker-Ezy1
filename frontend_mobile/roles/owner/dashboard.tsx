import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Dimensions, Image, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Card, Chip, Divider, IconButton, Surface, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import getShiftPharmacyName from '@/roles/shared/shifts/utils/getShiftPharmacyName';
import apiClient from '@/utils/apiClient';
import HomeNavigationGrid from '@/components/HomeNavigationGrid';
import {
  DashboardActivity,
  DashboardErrorState,
  DashboardLoadingState,
  DashboardScopeSwitcher,
  DashboardStatsOverview,
  type DashboardPayload,
  useScopedDashboard,
} from '@/roles/shared/dashboard/dashboardScope';

const { width } = Dimensions.get('window');

type ShiftSummary = {
  id: number;
  pharmacy_name: string;
  date: string;
  status?: string;
  role?: string;
};

type PillSummary = {
  balance: number;
  shift_post_cost: number;
};

export default function OwnerDashboard() {
  const router = useRouter();
  const { access, user, logout, isLoading: authLoading } = useAuth();
  const normalizedRole = String(user?.role || '').toUpperCase();
  const scope = useScopedDashboard('OWNER');
  const [dashboardData, setDashboardData] = useState<DashboardPayload | null>(null);
  const [pillSummary, setPillSummary] = useState<PillSummary>({ balance: 0, shift_post_cost: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(30));

  const formatShiftDate = useCallback((dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (normalizedRole !== 'OWNER' || !access) return;
    setRefreshing(true);
    setErrorMessage(null);
    try {
      const [dashboardPayload, pillRes] = await Promise.all([
        scope.fetchDashboard(),
        apiClient.get('/client-profile/pill-rewards/balance/').catch(() => null),
      ]);

      setDashboardData(dashboardPayload);
      setErrorMessage(null);
      if (pillRes?.data) {
        setPillSummary({
          balance: Number(pillRes.data?.balance ?? 0),
          shift_post_cost: Number(pillRes.data?.shift_post_cost ?? 0),
        });
      }

      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }),
      ]).start();
    } catch (err: any) {
      console.error('Failed to load dashboard', err);
      setDashboardData(null);
      setErrorMessage(
        err?.response?.status === 403
          ? 'You no longer have access to that pharmacy scope. The dashboard scope has been reset.'
          : err?.response?.data?.detail || 'Unable to load dashboard analytics right now.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [normalizedRole, access, fadeAnim, slideAnim, scope.fetchDashboard]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (normalizedRole !== 'OWNER') {
      setLoading(false);
      return;
    }
    if (!access) {
      setLoading(true);
      return;
    }
    void fetchData();
  }, [fetchData, normalizedRole, access, authLoading]);

  const quickActions = useMemo(
    () => {
      const pharmacyCount = scope.pharmacies.length;
      const firstPharmacyId = scope.pharmacies[0]?.id;
      const managePharmacyRoute =
        pharmacyCount === 1 && firstPharmacyId
          ? `/owner/pharmacies/${firstPharmacyId}`
          : '/owner/pharmacies';
      return [
        { title: 'Post Shift', description: 'Create coverage', icon: 'plus-circle-outline', route: '/owner/post-shift' },
        { title: pharmacyCount > 1 ? 'Manage Pharmacies' : 'Manage Pharmacy', description: pharmacyCount > 1 ? 'Manage stores' : 'Manage staff', icon: 'store-outline', route: managePharmacyRoute },
        { title: 'Roster', description: 'Shift centre', icon: 'calendar-month-outline', route: '/owner/shifts' },
        { title: 'Calendar', description: 'Schedule view', icon: 'calendar-outline', route: '/owner/calendar' },
        { title: 'Staff', description: 'Team members', icon: 'account-group-outline', route: '/owner/staff' },
        { title: 'Locums', description: 'Casual pharmacy staff', icon: 'account-heart-outline', route: '/owner/locums' },
        { title: 'Talent Board', description: 'Find talent', icon: 'account-search-outline', route: '/owner/talent-board' },
        { title: 'Hub', description: 'Community posts', icon: 'view-grid-outline', route: '/owner/hub' },
        { title: 'Messages', description: 'Open chat', icon: 'message-text-outline', route: '/owner/chat' },
        { title: 'Shift Center', description: 'Manage shifts', icon: 'clipboard-text-clock-outline', route: '/owner/shifts' },
        { title: 'Subscription', description: 'Billing seats', icon: 'credit-card-outline', route: '/owner/subscription-seats' },
        { title: 'Profile', description: 'Account details', icon: 'account-circle-outline', route: '/owner/profile' },
      ];
    },
    [scope.pharmacies]
  );

  const upcomingShifts: ShiftSummary[] = useMemo(
    () =>
      (dashboardData?.shifts ?? []).slice(0, 5).map((s: any) => ({
        id: s.id,
        pharmacy_name: getShiftPharmacyName(s),
        date: s.date || s.start_time || s.start || '',
        status: s.status,
        role: s.role_needed || s.role || 'Staff',
      })),
    [dashboardData?.shifts]
  );

  if (loading) {
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData} tintColor="#6366F1" />}
        showsVerticalScrollIndicator={false}
      >
        <DashboardScopeSwitcher
          pharmacies={scope.pharmacies}
          scopeLabel={scope.scopeLabel}
          workspace={scope.workspace}
          selectedPharmacyId={scope.selectedPharmacyId}
          canSelectPlatform={scope.canSelectPlatform}
          onSelectPlatform={scope.selectPlatform}
          onSelectPharmacy={scope.selectPharmacy}
        />
        {errorMessage ? <DashboardErrorState message={errorMessage} onRetry={fetchData} /> : null}
        {/* <View style={styles.statsContainer}>
          <View style={styles.sectionHeader}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Performance Overview
            </Text>
          </View>
          <View style={styles.statsGrid}>
            {statCards.map((stat) => (
              <Animated.View key={stat.label} style={{ opacity: fadeAnim, transform: [{ scale: fadeAnim }] }}>
                <Card style={styles.statCard}>
                  <Card.Content style={styles.statCardContent}>
                    <View style={styles.statCardHeader}>
                      <View style={[styles.statIcon, { backgroundColor: `${stat.color}15` }]}>
                        <IconButton icon={stat.icon} size={20} iconColor={stat.color} />
                      </View>
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

        <TouchableOpacity
          style={styles.pillHero}
          onPress={() => router.push('/owner/pills' as any)}
          activeOpacity={0.82}
        >
          <LinearGradient colors={['#267DB8', '#433894', '#9A087D']} locations={[0, 0.58, 1]} start={{ x: 0, y: 0.1 }} end={{ x: 1, y: 1 }} style={styles.pillHeroGradient}>
            <View pointerEvents="none" style={styles.heroAngleOne} />
            <View pointerEvents="none" style={styles.heroAngleTwo} />
            <View style={styles.pillHeroCopy}>
              <Text variant="labelMedium" style={styles.pillHeroEyebrow}>
                Owner rewards
              </Text>
              <View style={styles.pillBalanceRow}>
                <Text variant="displaySmall" style={styles.pillBalanceValue}>
                  {pillSummary.balance}
                </Text>
                <Text variant="titleMedium" style={styles.pillBalanceLabel}>
                  pills
                </Text>
              </View>
              <Text variant="bodySmall" style={styles.pillHeroText}>
                Use pills toward owner actions instead of paying every time.
              </Text>
              <View style={styles.pillMetaRow}>
                <Chip compact style={styles.pillMetaChip} textStyle={styles.pillMetaChipText}>
                  {pillSummary.shift_post_cost} pills per shift post
                </Chip>
                <Chip compact style={styles.pillMetaChip} textStyle={styles.pillMetaChipText}>
                  View activity
                </Chip>
              </View>
            </View>
            <Image source={require('@/assets/images/drugs.png')} style={styles.pillHeroImage} resizeMode="contain" />
          </LinearGradient>
        </TouchableOpacity>

        <DashboardStatsOverview data={dashboardData} />

        <HomeNavigationGrid items={quickActions} onNavigate={(route) => router.push(route as any)} />

        <DashboardActivity data={dashboardData} />

        {upcomingShifts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Upcoming Shifts
              </Text>
              <TouchableOpacity onPress={() => router.push('/owner/shifts' as any)}>
                <Text style={styles.seeAllText}>View All</Text>
              </TouchableOpacity>
            </View>
            {upcomingShifts.slice(0, 3).map((shift) => (
              <Card key={shift.id} style={styles.shiftPreviewCard}>
                <Card.Content style={styles.shiftPreviewContent}>
                  <View style={styles.shiftPreviewLeft}>
                    <View style={styles.shiftIconContainer}>
                      <IconButton icon="calendar-clock" size={20} iconColor="#6366F1" />
                    </View>
                    <View style={styles.shiftTextColumn}>
                      <Text variant="labelMedium" style={styles.shiftPharmacyName} numberOfLines={1} ellipsizeMode="tail">
                        {shift.pharmacy_name}
                      </Text>
                      <Text variant="bodySmall" style={styles.shiftRole} numberOfLines={1} ellipsizeMode="tail">
                        {shift.role || 'Staff'}
                        {formatShiftDate(shift.date) ? ` · ${formatShiftDate(shift.date)}` : ''}
                      </Text>
                    </View>
                  </View>
                  <Chip
                    style={[
                      styles.shiftStatusChip,
                      { backgroundColor: shift.status?.toUpperCase() === 'CONFIRMED' ? '#D1FAE5' : '#FEF3C7' },
                    ]}
                    textStyle={{
                      color: shift.status?.toUpperCase() === 'CONFIRMED' ? '#059669' : '#D97706',
                      fontSize: 11,
                      lineHeight: 14,
                    }}
                    compact
                  >
                    {shift.status || 'Pending'}
                  </Chip>
                </Card.Content>
              </Card>
            ))}
          </View>
        )}

        <Surface style={styles.bottomSection}>
          <TouchableOpacity style={styles.bottomMenuItem} onPress={() => router.push('/owner/profile' as any)}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greetingText: { color: '#6B7280', marginBottom: 4, fontSize: 14 },
  nameText: { fontWeight: 'bold', color: '#111827', fontSize: 28 },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { position: 'relative' },
  notificationBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#EF4444' },
  avatar: { backgroundColor: '#6366F1' },
  avatarLabel: { color: '#FFFFFF', fontWeight: 'bold' },
  pillHero: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 22,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
  },
  pillHeroGradient: {
    minHeight: 176,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  heroAngleOne: {
    position: 'absolute',
    top: -58,
    left: 158,
    width: 150,
    height: 310,
    backgroundColor: 'rgba(255,255,255,0.16)',
    transform: [{ rotate: '-28deg' }],
  },
  heroAngleTwo: {
    position: 'absolute',
    right: -50,
    bottom: -70,
    width: 230,
    height: 300,
    backgroundColor: 'rgba(255,255,255,0.08)',
    transform: [{ rotate: '30deg' }],
  },
  pillHeroCopy: { flex: 1, paddingRight: 8 },
  pillHeroEyebrow: {
    color: 'rgba(255, 255, 255, 0.78)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  pillBalanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  pillBalanceValue: { color: '#FFFFFF', fontWeight: '900', lineHeight: 48 },
  pillBalanceLabel: { color: 'rgba(255, 255, 255, 0.9)', fontWeight: '700' },
  pillHeroText: { color: 'rgba(255, 255, 255, 0.88)', marginTop: 6, maxWidth: 230 },
  pillMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  pillMetaChip: { backgroundColor: 'rgba(255, 255, 255, 0.18)' },
  pillMetaChipText: { color: '#FFFFFF', fontWeight: '700', fontSize: 11 },
  pillHeroImage: { width: 126, height: 126, marginRight: -8 },
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
  gradientCard: { padding: 24 },
  heroContent: { gap: 20 },
  heroStats: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  heroStatItem: { alignItems: 'center', flex: 1 },
  heroStatValue: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 44, lineHeight: 52 },
  heroStatLabel: { color: 'rgba(255, 255, 255, 0.9)', marginTop: 4, fontSize: 13 },
  heroDivider: { width: 1, height: 40, backgroundColor: 'rgba(255, 255, 255, 0.3)' },
  heroButton: { borderRadius: 12, overflow: 'hidden' },
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
  heroButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16, marginLeft: -8 },
  statsContainer: { paddingHorizontal: 20, marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontWeight: '700', color: '#111827', fontSize: 18 },
  seeAllText: { color: '#6366F1', fontWeight: '600', fontSize: 14 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' },
  statCard: {
    width: 180,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  statCardContent: { paddingVertical: 20, paddingHorizontal: 18, gap: 10, alignItems: 'center' },
  statCardHeader: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  statIcon: { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  statValue: { fontWeight: 'bold', color: '#111827', fontSize: 30 },
  statLabel: { color: '#6B7280', fontSize: 13 },
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionHeaderText: { fontWeight: '700', color: '#111827', marginBottom: 16, fontSize: 18 },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'center',
  },
  quickActionCard: { width: (width - 64) / 2, alignItems: 'center', gap: 8 },
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
  quickActionTitle: { fontWeight: '600', color: '#111827', textAlign: 'center', fontSize: 12 },
  activityCard: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  activityItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 12 },
  activityIcon: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  activityContent: { flex: 1, gap: 2 },
  activityTitle: { color: '#111827', fontWeight: '600' },
  activityDesc: { color: '#6B7280', fontSize: 12 },
  activityTime: { color: '#9CA3AF', fontSize: 11 },
  activityDivider: { marginHorizontal: 16 },
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
  shiftPreviewContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  shiftPreviewLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  shiftIconContainer: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  shiftTextColumn: { flex: 1, minWidth: 0 },
  shiftPharmacyName: { color: '#111827', fontWeight: '600' },
  shiftRole: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  shiftStatusChip: {
    height: 26,
    alignSelf: 'center',
    marginLeft: 8,
    paddingHorizontal: 8,
    justifyContent: 'center',
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
  bottomMenuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  bottomMenuIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  bottomMenuContent: { flex: 1, marginLeft: 12 },
  bottomMenuTitle: { color: '#111827', fontWeight: '600' },
  bottomMenuDesc: { color: '#6B7280', fontSize: 12, marginTop: 2 },
});
