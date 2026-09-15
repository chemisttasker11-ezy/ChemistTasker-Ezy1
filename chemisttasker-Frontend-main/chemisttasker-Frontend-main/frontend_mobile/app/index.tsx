import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../context/AuthContext';
import { getOwnerSetupStatus } from '../utils/ownerSetup';

const ORG_ROLES = new Set(['ORGANIZATION', 'ORG_ADMIN', 'ORG_OWNER', 'ORG_STAFF', 'CHIEF_ADMIN', 'REGION_ADMIN']);

function hasOrganizationAccess(user: any) {
  const role = String(user?.role || '').toUpperCase();
  if (ORG_ROLES.has(role)) return true;
  return Array.isArray(user?.memberships) && user.memberships.some((membership: any) => {
    const membershipRole = String(membership?.role || '').toUpperCase();
    return ORG_ROLES.has(membershipRole);
  });
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const floatAnim = useRef(new Animated.Value(0)).current;
  const tiltAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 3600, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 3600, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(tiltAnim, { toValue: 1, duration: 5000, useNativeDriver: true }),
        Animated.timing(tiltAnim, { toValue: 0, duration: 5000, useNativeDriver: true }),
      ])
    ).start();
  }, [floatAnim, tiltAnim]);

  useEffect(() => {
    if (isLoading || !user) return;
    let active = true;
    const routeUser = async () => {
      const role = String(user.role || '').toUpperCase();
      if (hasOrganizationAccess(user)) {
        router.replace('/organization/dashboard' as any);
      } else if (role === 'OWNER') {
        const setupStatus = await getOwnerSetupStatus(user);
        if (active) {
          router.replace((setupStatus.nextPath || '/owner/dashboard') as any);
        }
      } else if (role === 'PHARMACIST') {
        router.replace('/pharmacist/dashboard' as any);
      } else if (role === 'OTHER_STAFF') {
        router.replace('/otherstaff/dashboard' as any);
      } else if (role === 'EXPLORER') {
        router.replace('/explorer/dashboard' as any);
      }
    };
    void routeUser();
    return () => {
      active = false;
    };
  }, [isLoading, user, router]);

  const translateY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -16] });
  const rotate = tiltAnim.interpolate({ inputRange: [0, 1], outputRange: ['-2deg', '2deg'] });
  const shouldShowAuthActions = !isLoading && !user;

  return (
    <AuthLayout title="Welcome" showTitle={false}>
      <View style={styles.hero}>
        <Animated.Image
          source={require('../assets/images/ChatGPT Image Jan 18, 2026, 08_14_43 PM.png')}
          style={[styles.heroImage, { transform: [{ translateY }, { rotate }] }]}
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
