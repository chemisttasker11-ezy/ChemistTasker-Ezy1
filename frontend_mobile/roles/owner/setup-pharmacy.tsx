import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Button, Dialog, HelperText, Portal, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import PharmacyForm from '@/roles/shared/pharmacies/PharmacyForm';
import { getOwnerSetupStatus, markOwnerPharmacySetupSkipped, ownerSetupPaths } from '@/utils/ownerSetup';
import { useAuth } from '@/context/AuthContext';

export default function OwnerSetupPharmacyScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [targetPharmacyCount, setTargetPharmacyCount] = useState(1);
  const [createdCount, setCreatedCount] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const [showAnotherPrompt, setShowAnotherPrompt] = useState(false);

  useEffect(() => {
    let active = true;
    void getOwnerSetupStatus(user)
      .then((status) => {
        if (!active) return;
        setTargetPharmacyCount(status.numberOfPharmacies);
        setCreatedCount(status.pharmaciesCount);

        if (!status.onboardingComplete) {
          router.replace(ownerSetupPaths.onboarding as any);
          return;
        }

        if (status.pharmaciesCount > 0) {
          router.replace(ownerSetupPaths.dashboard as any);
        }
      })
      .catch((err: any) => {
        if (!active) return;
        setError(err?.message || 'Unable to load pharmacy setup.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [router, user]);

  const handleCreateSuccess = () => {
    const nextCount = createdCount + 1;
    setCreatedCount(nextCount);

    if (targetPharmacyCount > 1 && nextCount < targetPharmacyCount) {
      setShowAnotherPrompt(true);
      return;
    }

    router.replace(ownerSetupPaths.dashboard as any);
  };

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
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <PharmacyForm
        key={formKey}
        mode="create"
        onSuccess={handleCreateSuccess}
        onCancel={() => router.replace(ownerSetupPaths.dashboard as any)}
        onContinueLater={async () => {
          await markOwnerPharmacySetupSkipped();
          router.replace(ownerSetupPaths.dashboard as any);
        }}
        showSetupHero
      />

      <Portal>
        <Dialog visible={showAnotherPrompt} dismissable={false}>
          <Dialog.Title>Add another pharmacy?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              Do you want to add another pharmacy now, or go straight to your dashboard?
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => {
                setShowAnotherPrompt(false);
                router.replace(ownerSetupPaths.dashboard as any);
              }}
            >
              Go to Dashboard
            </Button>
            <Button
              onPress={() => {
                setShowAnotherPrompt(false);
                setFormKey((value) => value + 1);
              }}
            >
              Add Another
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
});
