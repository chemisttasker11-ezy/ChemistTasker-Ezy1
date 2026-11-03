import React, { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';
import PharmacyForm from '@/roles/shared/pharmacies/PharmacyForm';
import { BottomSheet, Button, ContentState } from '@/components/ui';
import { colors, font, space, type } from '@/constants/tokens';
import { getOwnerSetupStatus, markOwnerPharmacySetupSkipped, ownerSetupPaths } from '@/utils/ownerSetup';
import { useAuth } from '@/context/AuthContext';
import { useGuardedNavigation } from '@/roles/shared/forms/UnsavedChangesRegistryProvider';

export default function OwnerSetupPharmacyScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const guardedNavigation = useGuardedNavigation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
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
  }, [router, user, retry]);

  const skipToDashboard = async () => {
    await markOwnerPharmacySetupSkipped();
    router.replace(ownerSetupPaths.dashboard as any);
  };

  // A plain Back leaves no skip marker, so the setup gate sends the owner straight back here: leave like Continue later.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: false });
  }, [navigation]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      guardedNavigation(() => void skipToDashboard());
      return true;
    });
    return () => sub.remove();
  });

  const handleCreateSuccess = () => {
    const nextCount = createdCount + 1;
    setCreatedCount(nextCount);

    if (targetPharmacyCount > 1 && nextCount < targetPharmacyCount) {
      setShowAnotherPrompt(true);
      return;
    }

    router.replace(ownerSetupPaths.dashboard as any);
  };

  if (loading || error) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          {error ? (
            <ContentState
              kind="error"
              title="Pharmacy setup didn't load"
              description={error}
              onAction={() => {
                setError('');
                setLoading(true);
                setRetry((value) => value + 1);
              }}
            />
          ) : (
            <ContentState kind="loading" />
          )}
        </View>
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
        onContinueLater={skipToDashboard}
        showSetupHero
      />

      <BottomSheet
        open={showAnotherPrompt}
        onClose={() => setShowAnotherPrompt(false)}
        dismissable={false}
        title="Add another pharmacy?"
        subtitle="Do you want to add another pharmacy now, or go straight to your dashboard?"
        footer={
          <View style={styles.sheetActions}>
            <Button
              label="Add another"
              icon={<Plus />}
              haptic="light"
              onPress={() => {
                setShowAnotherPrompt(false);
                setFormKey((value) => value + 1);
              }}
            />
            <Button
              variant="outlined"
              label="Go to dashboard"
              onPress={() => {
                setShowAnotherPrompt(false);
                router.replace(ownerSetupPaths.dashboard as any);
              }}
            />
          </View>
        }
      >
        <Text style={styles.progress}>
          <Text style={styles.count}>
            {createdCount} of {targetPharmacyCount}
          </Text>{' '}
          pharmacies added
        </Text>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pageBg },
  centered: { flex: 1, justifyContent: 'center', padding: space.xl },
  sheetActions: { gap: space.md },
  progress: {
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodyMedium.fontSize,
    lineHeight: type.bodyMedium.lineHeight,
  },
  count: { color: colors.textPrimary, fontFamily: font.inter.semiBold, fontVariant: ['tabular-nums'] },
});
