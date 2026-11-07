import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import WelcomeScreen from './welcome';
import { BrandLoader } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { getOwnerSetupStatus } from '../utils/ownerSetup';
import { hasOrganizationAccess, resolveInitialWorkspace } from '../utils/mobilePersona';
import { colors, space } from '../constants/tokens';
import { durations } from '../constants/motion';

export default function HomeScreen() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
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
      <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(durations.fast).delay(durations.slow)} style={styles.boot}>
        <BrandLoader size={56} accessibilityLabel="Loading your workspace" />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pageBg },
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
});
