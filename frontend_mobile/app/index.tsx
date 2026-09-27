import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../context/AuthContext';
import { getOwnerSetupStatus } from '../utils/ownerSetup';
import { hasOrganizationAccess, resolveInitialWorkspace } from '../utils/mobilePersona';
import { useAnimationEnabled } from '../hooks/useAnimationEnabled';

export default function HomeScreen() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const animationEnabled = useAnimationEnabled();
  const heroMotion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    heroMotion.stopAnimation();
    if (!animationEnabled) {
      heroMotion.setValue(0);
      return;
    }

    const heroLoop = Animated.loop(
      Animated.timing(heroMotion, {
        toValue: 1,
        duration: 10000,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    heroLoop.start();
    return () => heroLoop.stop();
  }, [animationEnabled, heroMotion]);

  const heroY = heroMotion.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -8, 0] });
  const heroRotate = heroMotion.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '0.6deg', '0deg'] });

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

  const shouldShowAuthActions = !isLoading && !user;

  return (
    <AuthLayout title="Welcome" showTitle={false}>
      <View style={styles.hero}>
        <Animated.Image
          source={require('../assets/images/ChatGPT Image Jan 18, 2026, 08_14_43 PM.png')}
          style={[styles.heroImage, { transform: [{ translateY: heroY }, { rotate: heroRotate }] }]}
          resizeMode="contain"
        />
        <Text variant="headlineSmall" style={styles.title}>
          Pharmacy staffing, simplified.
        </Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Manage shifts, teams, and chats in one place.
        </Text>
      </View>

      {shouldShowAuthActions ? (
        <View style={styles.actions}>
          <Button mode="contained" onPress={() => router.push('/login')} style={styles.primaryButton}>
            Go to Login
          </Button>
          <Button mode="text" onPress={() => router.push('/register')}>
            Create an account
          </Button>
        </View>
      ) : (
        <View style={styles.loadingState}>
          <ActivityIndicator size="small" color="#6366F1" />
          <Text style={styles.loadingText}>Loading your workspace...</Text>
        </View>
      )}
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: 8,
  },
  heroImage: {
    width: 220,
    height: 220,
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
    color: '#0f172a',
  },
  subtitle: {
    textAlign: 'center',
    color: '#4b5563',
  },
  actions: {
    marginTop: 12,
    gap: 8,
  },
  loadingState: {
    marginTop: 16,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#6b7280',
  },
  primaryButton: {
    borderRadius: 10,
  },
});
