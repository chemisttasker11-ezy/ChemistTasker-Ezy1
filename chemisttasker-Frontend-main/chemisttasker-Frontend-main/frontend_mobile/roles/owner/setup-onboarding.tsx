import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { ActivityIndicator, HelperText } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import OwnerProfileDetailScreen from './profile-detail';
import { getOwnerSetupStatus, ownerSetupPaths } from '@/utils/ownerSetup';
import { useAuth } from '@/context/AuthContext';

export default function OwnerSetupOnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void getOwnerSetupStatus(user)
      .then((status) => {
        if (!active) return;
        if (!status.nextPath) {
          router.replace(ownerSetupPaths.dashboard as any);
          return;
        }
        if (status.nextPath && status.nextPath !== ownerSetupPaths.onboarding) {
          router.replace(status.nextPath as any);
        }
      })
      .catch((err: any) => {
        if (!active) return;
        setError(err?.message || 'Unable to load owner setup.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [router, user]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['left', 'right']}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.centered} edges={['left', 'right']}>
        <HelperText type="error" visible>{error}</HelperText>
      </SafeAreaView>
    );
  }

  return (
    <OwnerProfileDetailScreen
      standalone
      onSuccessPath={ownerSetupPaths.pharmacies}
      onCancelPath={ownerSetupPaths.onboarding}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
});
