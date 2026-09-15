import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, Card, Divider, IconButton, Surface, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import HomeNavigationGrid from '@/components/HomeNavigationGrid';

export default function ExplorerOverviewScreen() {
  const { access, user, logout, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const normalizedRole = String(user?.role || '').toUpperCase();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  const loadDashboard = useCallback(async () => {
    if (normalizedRole !== 'EXPLORER' || !access) return;
    if (!refreshing) setLoading(true);
    try {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
      ]).start();
    } catch (err: any) {
      console.error('Unable to load explorer dashboard', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [normalizedRole, access, refreshing, fadeAnim, slideAnim]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (normalizedRole !== 'EXPLORER') {
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

  const quickActions = useMemo(
    () => [
      {
        title: 'Shifts',
        description: 'Browse roles',
        icon: 'calendar-search',
        route: '/explorer/shifts',
      },
      {
        title: 'Availability',
        description: 'Set schedule',
        icon: 'calendar-clock-outline',
        route: '/explorer/availability',
      },
      {
        title: 'Talent Board',
        description: 'Browse candidates',
        icon: 'account-search-outline',
        route: '/explorer/talent-board',
      },
      {
        title: 'Calendar',
        description: 'View calendar',
        icon: 'calendar-outline',
        route: '/explorer/calendar',
      },
      {
        title: 'Chat',
        description: 'Open messages',
        icon: 'message-text-outline',
        route: '/explorer/chat',
      },
      {
        title: 'Interests',
        description: 'Preferences',
        icon: 'heart-outline',
        route: '/explorer/profile-interests',
      },
      {
        title: 'Notifications',
        description: 'Alerts',
        icon: 'bell-outline',
        route: '/explorer/notifications',
      },
      {
        title: 'Profile',
        description: 'Edit details',
        icon: 'account-circle-outline',
        route: '/explorer/profile',
      },
    ],
    []
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading your dashboard...</Text>
        </View>
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
        <HomeNavigationGrid items={quickActions} onNavigate={(route) => router.push(route as any)} />

        <Surface style={styles.bottomSection}>
          <TouchableOpacity style={styles.bottomMenuItem} onPress={() => router.push('/explorer/profile' as any)}>
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { color: '#6B7280', fontSize: 16 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greetingText: { color: '#6B7280', marginBottom: 4, fontSize: 14 },
  nameText: { fontWeight: 'bold', color: '#111827', fontSize: 28 },
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
  section: { marginBottom: 24, paddingHorizontal: 20 },
  sectionHeaderText: { fontWeight: '700', color: '#111827', marginBottom: 16, fontSize: 18 },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
  },
  quickActionCard: { width: '48%', alignItems: 'center', paddingVertical: 6 },
  quickActionGradient: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickActionTitle: { color: '#111827', fontWeight: '700', marginBottom: 2 },
  quickActionDesc: { color: '#6B7280', fontSize: 12, textAlign: 'center' },
  bottomSection: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  bottomMenuItem: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  bottomMenuIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bottomMenuContent: { flex: 1 },
  bottomMenuTitle: { color: '#111827', fontWeight: '600' },
  bottomMenuDesc: { color: '#6B7280', marginTop: 2 },
});

