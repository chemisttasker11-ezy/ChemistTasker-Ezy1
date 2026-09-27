import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Icon, Surface, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import getShiftPharmacyName from '@/roles/shared/shifts/utils/getShiftPharmacyName';
import apiClient from '@/utils/apiClient';
import { managerTools } from '@/components/ParityToolsCard';
import { brandColors } from '@/constants/theme';
import {
  DashboardActivity,
  DashboardErrorState,
  DashboardLoadingState,
  DashboardPersonaSwitcher,
  DashboardScopeSwitcher,
  type DashboardPayload,
  useScopedDashboard,
} from '@/roles/shared/dashboard/dashboardScope';

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
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
  const showTwoColumnActions = width >= 460;
  const { access, user, logout, isLoading: authLoading } = useAuth();
  const normalizedRole = String(user?.role || '').toUpperCase();
  const scope = useScopedDashboard('OWNER');
  const [dashboardData, setDashboardData] = useState<DashboardPayload | null>(null);
  const [pillSummary, setPillSummary] = useState<PillSummary>({ balance: 0, shift_post_cost: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

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
      setLastUpdatedAt(new Date());
      if (pillRes?.data) {
        setPillSummary({
          balance: Number(pillRes.data?.balance ?? 0),
          shift_post_cost: Number(pillRes.data?.shift_post_cost ?? 0),
        });
      }

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
  }, [normalizedRole, access, scope.fetchDashboard]);

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

  const greetingName =
    dashboardData?.user?.first_name ||
    user?.first_name ||
    user?.username ||
    'there';
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const metrics = useMemo(
    () => [
      {
        label: 'Open shifts',
        value: Number(dashboardData?.shift_summary?.open_count ?? 0),
        icon: 'calendar-alert',
        tone: brandColors.purple,
      },
      {
        label: 'This week',
        value: Number(dashboardData?.upcoming_stats?.week ?? 0),
        icon: 'calendar-week',
        tone: brandColors.blue,
      },
      {
        label: 'Confirmed',
        value: Number(dashboardData?.shift_summary?.confirmed_count ?? 0),
        icon: 'check-decagram-outline',
        tone: brandColors.success,
      },
    ],
    [dashboardData]
  );

  const featuredActions = quickActions.slice(0, 2);
  const workspaceActions = quickActions.slice(2);
  const supplementalTools = managerTools.filter((tool) => !quickActions.some((action) => action.route === tool.route));
  const visibleTools = toolsExpanded ? supplementalTools : supplementalTools.slice(0, 4);

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
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData} tintColor={brandColors.purple} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderCopy}>
            <Text style={styles.pageTitle}>Owner overview</Text>
            <Text style={styles.pageSubtitle}>Your pharmacy, shifts and team in one clear view.</Text>
          </View>
          {dashboardData && lastUpdatedAt && !errorMessage ? (
            <View style={styles.livePill} accessibilityLabel={`Dashboard updated at ${lastUpdatedAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Updated {lastUpdatedAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
          ) : null}
        </View>

        <DashboardPersonaSwitcher role="OWNER" />

        <View style={styles.hero}>
          <LinearGradient
            colors={['#081C3E', '#281457', '#5222B8']}
            locations={[0, 0.58, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <View pointerEvents="none" style={styles.heroOrbitLarge} />
            <View pointerEvents="none" style={styles.heroOrbitSmall} />
            <Text style={styles.heroGreeting}>{greeting}, {greetingName}</Text>
            <Text style={styles.heroTitle}>Keep your pharmacy moving.</Text>
            <Text style={styles.heroBody}>
              Post coverage, check staffing and move directly into today&apos;s work.
            </Text>
            <View style={styles.featuredActions}>
              {featuredActions.map((action, index) => (
                <Pressable
                  key={`${action.route}-${action.title}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${action.title}. ${action.description}`}
                  onPress={() => router.push(action.route as any)}
                  style={({ pressed }) => [
                    styles.featuredAction,
                    index === 0 ? styles.featuredActionPrimary : styles.featuredActionSecondary,
                    pressed && styles.pressed,
                  ]}
                >
                  <Icon
                    source={action.icon}
                    size={20}
                    color={index === 0 ? brandColors.navy : brandColors.white}
                  />
                  <Text style={index === 0 ? styles.featuredActionPrimaryText : styles.featuredActionSecondaryText}>
                    {action.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          </LinearGradient>
        </View>

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

        <Surface style={styles.metricRail} elevation={0}>
          {metrics.map((metric, index) => (
            <View key={metric.label} style={[styles.metricItem, index > 0 && styles.metricDivider]}>
              <Icon source={metric.icon} size={20} color={metric.tone} />
              <Text style={styles.metricValue}>{metric.value}</Text>
              <Text style={styles.metricLabel}>{metric.label}</Text>
            </View>
          ))}
        </Surface>

        <View style={[styles.dashboardColumns, isWide && styles.dashboardColumnsWide]}>
          <View style={styles.dashboardColumn}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Run your pharmacy</Text>
                <Text style={styles.sectionDescription}>Daily operations without the dashboard clutter.</Text>
              </View>
            </View>
            <Surface style={styles.workspacePanel} elevation={0}>
              <View style={styles.actionMatrix}>
                {workspaceActions.map((action) => (
                  <Pressable
                    key={`${action.route}-${action.title}`}
                    accessibilityRole="button"
                    accessibilityLabel={action.description ? `${action.title}. ${action.description}` : action.title}
                    onPress={() => router.push(action.route as any)}
                    style={({ pressed }) => [styles.actionCell, showTwoColumnActions && styles.actionCellTwoColumn, pressed && styles.actionCellPressed]}
                  >
                    <View style={styles.actionIcon}>
                      <Icon source={action.icon} size={22} color={brandColors.purple} />
                    </View>
                    <View style={styles.actionCopy}>
                      <Text style={styles.actionTitle} numberOfLines={1}>{action.title}</Text>
                      <Text style={styles.actionDescription} numberOfLines={1}>{action.description}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </Surface>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Upcoming shifts</Text>
                <Text style={styles.sectionDescription}>The next coverage commitments in this workspace.</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => router.push('/owner/shifts' as any)} hitSlop={8}>
                <Text style={styles.sectionLink}>View all</Text>
              </Pressable>
            </View>
            <Surface style={styles.listPanel} elevation={0}>
              {upcomingShifts.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Icon source="calendar-check-outline" size={26} color={brandColors.purple} />
                  </View>
                  <Text style={styles.emptyTitle}>No upcoming shifts</Text>
                  <Text style={styles.emptyText}>Newly confirmed coverage will appear here.</Text>
                </View>
              ) : (
                upcomingShifts.slice(0, 4).map((shift, index) => {
                  const confirmed = shift.status?.toUpperCase() === 'CONFIRMED';
                  return (
                    <View
                      key={shift.id}
                      style={[styles.shiftRow, index < Math.min(upcomingShifts.length, 4) - 1 && styles.rowDivider]}
                    >
                      <View style={styles.dateTile}>
                        <Icon source="calendar-clock" size={20} color={brandColors.navy} />
                      </View>
                      <View style={styles.shiftCopy}>
                        <Text style={styles.shiftPharmacy} numberOfLines={1}>{shift.pharmacy_name}</Text>
                        <Text style={styles.shiftMeta} numberOfLines={1}>
                          {shift.role || 'Staff'}{formatShiftDate(shift.date) ? ` · ${formatShiftDate(shift.date)}` : ''}
                        </Text>
                      </View>
                      <View style={[styles.statusPill, confirmed ? styles.statusConfirmed : styles.statusPending]}>
                        <Text style={[styles.statusText, confirmed ? styles.statusConfirmedText : styles.statusPendingText]}>
                          {shift.status || 'Pending'}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </Surface>
          </View>

          <View style={styles.dashboardColumn}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${pillSummary.balance} pills available. View rewards activity.`}
              onPress={() => router.push('/owner/pills' as any)}
              style={({ pressed }) => [styles.rewardBanner, pressed && styles.pressed]}
            >
              <View style={styles.rewardIcon}>
                <Icon source="pill" size={24} color={brandColors.cyan} />
              </View>
              <View style={styles.rewardCopy}>
                <Text style={styles.rewardValue}>{pillSummary.balance} pills available</Text>
                <Text style={styles.rewardDescription}>{pillSummary.shift_post_cost} pills per shift post</Text>
              </View>
              <Icon source="arrow-top-right" size={20} color={brandColors.white} />
            </Pressable>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Work and platform tools</Text>
                <Text style={styles.sectionDescription}>Specialist workflows when you need them.</Text>
              </View>
            </View>
            <Surface style={styles.listPanel} elevation={0}>
              {visibleTools.map((tool, index) => (
                <Pressable
                  key={tool.route}
                  accessibilityRole="button"
                  accessibilityLabel={`${tool.title}. ${tool.subtitle}`}
                  onPress={() => router.push(tool.route as any)}
                  style={({ pressed }) => [
                    styles.toolRow,
                    index < visibleTools.length - 1 && styles.rowDivider,
                    pressed && styles.toolRowPressed,
                  ]}
                >
                  <View style={styles.toolIcon}>
                    <Icon source={tool.icon} size={21} color={brandColors.navy} />
                  </View>
                  <View style={styles.toolCopy}>
                    <Text style={styles.toolTitle}>{tool.title}</Text>
                    <Text style={styles.toolDescription} numberOfLines={1}>{tool.subtitle}</Text>
                  </View>
                  <Icon source="chevron-right" size={20} color="#8A97AA" />
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: toolsExpanded }}
                onPress={() => setToolsExpanded((value) => !value)}
                style={({ pressed }) => [styles.expandButton, pressed && styles.pressed]}
              >
                <Text style={styles.expandButtonText}>{toolsExpanded ? 'Show fewer tools' : 'Show all tools'}</Text>
                <Icon source={toolsExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={brandColors.purple} />
              </Pressable>
            </Surface>

            <DashboardActivity data={dashboardData} />
          </View>
        </View>

        <View style={styles.footerActions}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/owner/profile' as any)} style={styles.footerAction}>
            <Icon source="account-cog-outline" size={20} color={brandColors.navy} />
            <Text style={styles.footerActionText}>Account</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/contact' as any)} style={styles.footerAction}>
            <Icon source="help-circle-outline" size={20} color={brandColors.navy} />
            <Text style={styles.footerActionText}>Support</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              await logout();
              router.replace('/login' as any);
            }}
            style={styles.footerAction}
          >
            <Icon source="logout" size={20} color={brandColors.danger} />
            <Text style={[styles.footerActionText, styles.signOutText]}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: brandColors.mist },
  scrollView: { flex: 1 },
  scrollContent: {
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  scrollContentWide: { paddingHorizontal: 28, paddingTop: 20 },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 18,
  },
  pageHeaderCopy: { flex: 1 },
  pageTitle: {
    color: brandColors.navy,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    color: brandColors.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 3,
  },
  livePill: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    backgroundColor: brandColors.successSoft,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: brandColors.success },
  liveText: { color: brandColors.success, fontSize: 12 },
  hero: {
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 18,
    shadowColor: brandColors.navy,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 4,
  },
  heroGradient: { minHeight: 196, padding: 22, justifyContent: 'center', position: 'relative' },
  heroOrbitLarge: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 38,
    borderColor: 'rgba(255,255,255,0.07)',
    right: -76,
    top: -86,
  },
  heroOrbitSmall: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: 'rgba(0,189,210,0.16)',
    right: 42,
    bottom: -44,
  },
  heroGreeting: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    lineHeight: 20,
  },
  heroTitle: {
    color: brandColors.white,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.5,
    maxWidth: 480,
    marginTop: 5,
  },
  heroBody: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 510,
    marginTop: 8,
  },
  featuredActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 },
  featuredAction: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 11,
    paddingHorizontal: 18,
  },
  featuredActionPrimary: { backgroundColor: brandColors.white },
  featuredActionSecondary: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  featuredActionPrimaryText: {
    color: brandColors.navy,
    fontSize: 14,
  },
  featuredActionSecondaryText: {
    color: brandColors.white,
    fontSize: 14,
  },
  pressed: { opacity: 0.72 },
  metricRail: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 16,
    backgroundColor: brandColors.white,
    overflow: 'hidden',
    marginTop: 18,
    marginBottom: 26,
  },
  metricItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 112, padding: 12 },
  metricDivider: { borderLeftWidth: 1, borderLeftColor: brandColors.borderSoft },
  metricValue: {
    color: brandColors.navy,
    fontSize: 27,
    lineHeight: 32,
    marginTop: 5,
  },
  metricLabel: {
    color: brandColors.body,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  dashboardColumns: { gap: 26 },
  dashboardColumnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  dashboardColumn: { flex: 1, minWidth: 0, gap: 0 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 11,
  },
  sectionTitle: {
    color: brandColors.navy,
    fontSize: 21,
    lineHeight: 27,
  },
  sectionDescription: {
    color: brandColors.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  sectionLink: { color: brandColors.purple, fontSize: 13, paddingVertical: 6 },
  workspacePanel: {
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 16,
    backgroundColor: brandColors.white,
    padding: 10,
    marginBottom: 26,
  },
  actionMatrix: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionCell: {
    width: '100%',
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 11,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  actionCellTwoColumn: { width: '48.9%' },
  actionCellPressed: { backgroundColor: '#F2EEFB' },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F2EEFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCopy: { flex: 1, minWidth: 0 },
  actionTitle: { color: brandColors.navy, fontSize: 13, lineHeight: 18 },
  actionDescription: { color: brandColors.body, fontSize: 11, lineHeight: 16, marginTop: 1 },
  listPanel: {
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 16,
    backgroundColor: brandColors.white,
    overflow: 'hidden',
    marginBottom: 26,
  },
  emptyState: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 30 },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#F2EEFB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 11,
  },
  emptyTitle: { color: brandColors.navy, fontSize: 14, lineHeight: 20 },
  emptyText: {
    color: brandColors.body,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 3,
  },
  shiftRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 11 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: brandColors.borderSoft },
  dateTile: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: '#EEF4FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shiftCopy: { flex: 1, minWidth: 0 },
  shiftPharmacy: { color: brandColors.navy, fontSize: 13, lineHeight: 18 },
  shiftMeta: { color: brandColors.body, fontSize: 11, lineHeight: 16, marginTop: 2 },
  statusPill: { minHeight: 28, justifyContent: 'center', borderRadius: 999, paddingHorizontal: 9, flexShrink: 0 },
  statusConfirmed: { backgroundColor: brandColors.successSoft },
  statusPending: { backgroundColor: brandColors.warningSoft },
  statusText: { fontSize: 10 },
  statusConfirmedText: { color: brandColors.success },
  statusPendingText: { color: brandColors.warning },
  rewardBanner: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    backgroundColor: brandColors.navy,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 26,
  },
  rewardIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: 'rgba(0,189,210,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardCopy: { flex: 1 },
  rewardValue: { color: brandColors.white, fontSize: 18, lineHeight: 23 },
  rewardDescription: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 1,
  },
  toolRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 10 },
  toolRowPressed: { backgroundColor: brandColors.surfaceMuted },
  toolIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: '#EEF4FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolCopy: { flex: 1, minWidth: 0 },
  toolTitle: { color: brandColors.navy, fontSize: 13, lineHeight: 18 },
  toolDescription: { color: brandColors.body, fontSize: 11, lineHeight: 16, marginTop: 2 },
  expandButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: brandColors.surfaceMuted,
  },
  expandButtonText: { color: brandColors.purple, fontSize: 12 },
  footerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: brandColors.border,
    paddingTop: 18,
  },
  footerAction: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  footerActionText: { color: brandColors.navy, fontSize: 13 },
  signOutText: { color: brandColors.danger },
});
