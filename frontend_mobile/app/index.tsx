import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../context/AuthContext';
import { getOwnerSetupStatus } from '../utils/ownerSetup';
import { brandColors } from '../constants/theme';
import { hasOrganizationAccess, resolveInitialWorkspace } from '../utils/mobilePersona';

export default function HomeScreen() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  useEffect(() => {
    if (isLoading || !user) return;
    let active = true;
    const routeUser = async () => {
      const role = String(user.role || '').toUpperCase();
      if (hasOrganizationAccess(user)) {
        router.replace('/organization/dashboard' as any);
        return;
      }
      if (role === 'OWNER') {
        const setupStatus = await getOwnerSetupStatus(user);
        if (active) router.replace((setupStatus.nextPath || '/owner/dashboard') as any);
        return;
      }
      const workspaceRoute = await resolveInitialWorkspace(user);
      if (active) router.replace(workspaceRoute as any);
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
        <Image
          source={require('../assets/images/clipsnap-edit-6-1-2026.png')}
          style={styles.heroImage}
          resizeMode="contain"
        />
        <Text variant="headlineSmall" style={styles.title}>
          The pharmacy workforce, connected.
        </Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Shifts, teams, attendance, marketplace and work tools in one trusted workspace.
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
          <ActivityIndicator size="small" color={brandColors.purple} />
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
    height: 82,
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
    color: '#06214A',
  },
  subtitle: {
    textAlign: 'center',
    color: '#59677E',
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
    color: '#59677E',
  },
  primaryButton: {
    borderRadius: 10,
  },
});
