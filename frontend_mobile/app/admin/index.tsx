import React, { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Chip, Surface, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import apiClient from '@/utils/apiClient';
import HomeNavigationGrid from '@/components/HomeNavigationGrid';
import { DashboardActivity, DashboardPersonaSwitcher, type DashboardPayload } from '@/roles/shared/dashboard/dashboardScope';

export default function AdminHomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [pillSummary, setPillSummary] = useState({ balance: 0, shift_post_cost: 0 });
  const [dashboardData, setDashboardData] = useState<DashboardPayload | null>(null);
  const assignment = useMemo(() => {
    const assignments = Array.isArray((user as any)?.admin_assignments)
      ? (user as any).admin_assignments
      : [];
    return assignments.find((item: any) => item?.pharmacy_id || item?.pharmacyId) || assignments[0] || null;
  }, [user]);
  const pharmacyId = assignment?.pharmacy_id ?? assignment?.pharmacyId ?? assignment?.pharmacy ?? null;
  const pharmacyName = assignment?.pharmacy_name ?? assignment?.pharmacyName ?? (pharmacyId ? `Pharmacy #${pharmacyId}` : 'Admin pharmacy');

  useEffect(() => {
    let mounted = true;
    const dashboardParams = pharmacyId
      ? { workspace: 'internal', pharmacy_id: pharmacyId }
      : { workspace: 'internal' };
    Promise.all([
      apiClient.get('/client-profile/pill-rewards/balance/').catch(() => null),
      apiClient.get('/client-profile/dashboard/owner/', { params: dashboardParams }).catch(() => null),
    ]).then(([pillRes, dashboardRes]) => {
      if (!mounted) return;
      if (pillRes?.data) {
        setPillSummary({
          balance: Number(pillRes.data?.balance ?? 0),
          shift_post_cost: Number(pillRes.data?.shift_post_cost ?? 0),
        });
      } else {
        setPillSummary({ balance: 0, shift_post_cost: 0 });
      }
      setDashboardData((dashboardRes?.data ?? null) as DashboardPayload | null);
    });
    return () => {
      mounted = false;
    };
  }, [pharmacyId]);

  const adminPath = (path: string) => {
    if (pharmacyId) {
      return `/admin/${pharmacyId}/${path}`;
    }
    return `/admin/${path}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <DashboardPersonaSwitcher role={user?.role} />

        <Surface style={styles.hero}>
          <Text variant="labelLarge" style={styles.eyebrow}>Admin workspace</Text>
          <Text variant="headlineSmall" style={styles.title}>{pharmacyName}</Text>
          <Text style={styles.subtitle}>
            Manage shifts, referrals, and pill rewards for the pharmacy you administer.
          </Text>
        </Surface>

        <TouchableOpacity
          style={styles.pillHero}
          onPress={() => router.push(adminPath('pills') as any)}
          activeOpacity={0.84}
        >
          <LinearGradient colors={['#267DB8', '#433894', '#9A087D']} locations={[0, 0.58, 1]} start={{ x: 0, y: 0.1 }} end={{ x: 1, y: 1 }} style={styles.pillHeroGradient}>
            <View pointerEvents="none" style={styles.heroAngleOne} />
            <View pointerEvents="none" style={styles.heroAngleTwo} />
            <View style={styles.pillHeroCopy}>
              <Text variant="labelMedium" style={styles.pillHeroEyebrow}>Pharmacy admin pills</Text>
              <View style={styles.pillBalanceRow}>
                <Text variant="displaySmall" style={styles.pillBalanceValue}>{pillSummary.balance}</Text>
                <Text variant="titleMedium" style={styles.pillBalanceLabel}>pills</Text>
              </View>
              <Text variant="bodySmall" style={styles.pillHeroText}>Use pills toward shift posting for this admin workspace.</Text>
              <View style={styles.pillMetaRow}>
                <Chip compact style={styles.pillMetaChip} textStyle={styles.pillMetaChipText}>
                  {pillSummary.shift_post_cost} pills per shift post
                </Chip>
                {pharmacyId ? (
                  <Chip compact style={styles.pillMetaChip} textStyle={styles.pillMetaChipText}>
                    Pharmacy #{pharmacyId}
                  </Chip>
                ) : null}
              </View>
            </View>
            <Image source={require('@/assets/images/drugs.png')} style={styles.pillHeroImage} resizeMode="contain" />
          </LinearGradient>
        </TouchableOpacity>

        <HomeNavigationGrid
          items={[
            { title: 'Shift Centre', description: 'Active shifts', icon: 'calendar-month-outline', route: '/admin/shifts' },
            { title: 'Post Shift', description: 'Create coverage', icon: 'plus-circle-outline', route: adminPath('post-shift') },
            { title: 'Pharmacies', description: 'Store details', icon: 'store-outline', route: '/admin/pharmacies' },
            { title: 'Chat', description: 'Open messages', icon: 'message-text-outline', route: '/admin/chat' },
            { title: 'Shift Center', description: 'Manage shifts', icon: 'clipboard-text-clock-outline', route: '/admin/shifts' },
            { title: 'Notifications', description: 'Alerts', icon: 'bell-outline', route: '/admin/notifications' },
          ]}
          onNavigate={(route) => router.push(route as any)}
        />

        <DashboardActivity data={dashboardData} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollView: { flex: 1 },
  content: { padding: 20, gap: 16 },
  hero: { borderRadius: 22, padding: 20, backgroundColor: '#FFFFFF' },
  eyebrow: { color: '#6366F1', textTransform: 'uppercase', letterSpacing: 1 },
  title: { color: '#111827', fontWeight: '900', marginTop: 6 },
  subtitle: { color: '#6B7280', marginTop: 8, lineHeight: 20 },
  grid: { gap: 12 },
  card: { borderRadius: 18, padding: 16, backgroundColor: '#FFFFFF' },
  cardTitle: { color: '#111827', fontWeight: '800' },
  cardText: { color: '#6B7280', marginTop: 4, marginBottom: 12 },
  cardButton: { alignSelf: 'flex-start' },
  pillHero: { borderRadius: 22, overflow: 'hidden' },
  pillHeroGradient: {
    minHeight: 180,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  heroAngleOne: { position: 'absolute', top: -58, left: 158, width: 150, height: 310, backgroundColor: 'rgba(255,255,255,0.16)', transform: [{ rotate: '-28deg' }] },
  heroAngleTwo: { position: 'absolute', right: -50, bottom: -70, width: 230, height: 300, backgroundColor: 'rgba(255,255,255,0.08)', transform: [{ rotate: '30deg' }] },
  pillHeroCopy: { flex: 1, paddingRight: 8 },
  pillHeroEyebrow: { color: 'rgba(255,255,255,0.78)', textTransform: 'uppercase', letterSpacing: 1 },
  pillBalanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 },
  pillBalanceValue: { color: '#FFFFFF', fontWeight: '900', lineHeight: 48 },
  pillBalanceLabel: { color: 'rgba(255,255,255,0.9)', fontWeight: '700' },
  pillHeroText: { color: 'rgba(255,255,255,0.9)', marginTop: 8, maxWidth: 230 },
  pillMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  pillMetaChip: { backgroundColor: 'rgba(255,255,255,0.18)' },
  pillMetaChipText: { color: '#FFFFFF', fontWeight: '700', fontSize: 11 },
  pillHeroImage: { width: 118, height: 118, marginRight: -8 },
});

