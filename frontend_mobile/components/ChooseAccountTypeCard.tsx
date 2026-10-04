import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Surface, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { chooseAccountType } from '@chemisttasker/shared-core';

// A pharmacy-manager account (a pharmacy contact onboarded by an organisation) may add its own profile once.
const ACCOUNT_TYPES = [
  { role: 'PHARMACIST', label: 'Pharmacist', onboardingPath: '/pharmacist/onboarding' },
  { role: 'OTHER_STAFF', label: 'Other staff', onboardingPath: '/otherstaff/onboarding' },
  { role: 'OWNER', label: 'Pharmacy owner', onboardingPath: '/setup/owner/onboarding' },
] as const;

export default function ChooseAccountTypeCard() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (String(user?.role || '').toUpperCase() !== 'PHARMACY_MANAGER') return null;

  const choose = async (role: (typeof ACCOUNT_TYPES)[number]['role'], onboardingPath: string) => {
    setSaving(role);
    setError(null);
    try {
      await chooseAccountType(role);
      await refreshUser();
      router.replace(onboardingPath as any);
    } catch (err: any) {
      setError(err?.response?.data?.role?.[0] || err?.message || 'Unable to save your account type.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Surface style={styles.card}>
      <Text variant="titleMedium" style={styles.title}>Complete your profile (optional)</Text>
      <Text style={styles.body}>
        You manage this pharmacy already. Add your own profile to use ChemistTasker as a pharmacist, staff member or
        pharmacy owner too. You keep your admin access, and this choice can be made only once.
      </Text>
      <View style={styles.actions}>
        {ACCOUNT_TYPES.map((item) => (
          <Button
            key={item.role}
            mode="outlined"
            loading={saving === item.role}
            disabled={saving != null}
            onPress={() => choose(item.role, item.onboardingPath)}
          >
            {item.label}
          </Button>
        ))}
      </View>
      {error ? <HelperText type="error">{error}</HelperText> : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, marginBottom: 16 },
  title: { fontWeight: '700', marginBottom: 6 },
  body: { marginBottom: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
