import React, { useEffect } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import WelcomeScreen from './welcome';
import { officialLogo } from '../components/AuthLayout';
import { useAuth } from '../context/AuthContext';
import { getOwnerSetupStatus } from '../utils/ownerSetup';
import { hasOrganizationAccess, resolveInitialWorkspace } from '../utils/mobilePersona';
import { colors, font, space, type } from '../constants/tokens';
import { durations } from '../constants/motion';

const LOGO_RATIO = 900 / 436;

export default function HomeScreen() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || !user) return;
    let active = true;
    const routeUser = async () => {
      const role = String(user.role || '').toUpperCase();
      if (hasOrganizationAccess(user) && !['OWNER', 'PHARMACIST', 'OTHER_STAFF', 'EXPLORER'].includes(role)) {
        router.replace('/organization/dashboard' as any);
      } else if (role === 'OWNER') {
        const setupStatus = await getOwnerSetupStatus(user);
        if (active) {
          router.replace((setupStatus.nextPath || '/owner/dashboard') as any);
        }
      } else {
        const workspaceRoute = await resolveInitialWorkspace(user);
        if (active) router.replace(workspaceRoute as any);
      }
    };
    void routeUser();
    return () => {
      active = false;
    };
  }, [isLoading, user, router]);

  // Signed out: the one landing (same screen as /welcome).
  if (!isLoading && !user) return <WelcomeScreen />;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {/* Delayed fade: a fast session restore never flashes the status line. */}
      <Animated.View entering={FadeIn.duration(durations.fast).delay(durations.slow)} style={styles.boot}>
        <Image
          source={officialLogo}
          style={styles.logo}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="ChemistTasker"
        />
        <View style={styles.status} accessible accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.statusText}>Loading your workspace...</Text>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pageBg },
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space['2xl'], padding: space.xl },
  logo: { width: 200, height: 200 / LOGO_RATIO },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  statusText: {
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodyMedium.fontSize,
    lineHeight: type.bodyMedium.lineHeight,
  },
});
