import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Surface, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { chooseAccountType } from '@chemisttasker/shared-core';

// A pharmacy-manager account may remain a permanent admin-only identity.
const ACCOUNT_TYPES = [
  { role: 'PHARMACIST', staffRole: 'PHARMACIST', label: 'Pharmacist', onboardingPath: '/pharmacist/onboarding' },
  { role: 'OTHER_STAFF', staffRole: 'INTERN', label: 'Intern pharmacist', onboardingPath: '/otherstaff/onboarding' },
  { role: 'OTHER_STAFF', staffRole: 'TECHNICIAN', label: 'Dispensary technician', onboardingPath: '/otherstaff/onboarding' },
  { role: 'OTHER_STAFF', staffRole: 'ASSISTANT', label: 'Pharmacy assistant', onboardingPath: '/otherstaff/onboarding' },
  { role: 'OTHER_STAFF', staffRole: 'STUDENT', label: 'Pharmacy student', onboardingPath: '/otherstaff/onboarding' },
] as const;

export default function ChooseAccountTypeCard({ pharmacyId }: { pharmacyId: number | null }) {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (String(user?.role || '').toUpperCase() !== 'PHARMACY_MANAGER') return null;

  const choose = async (item: (typeof ACCOUNT_TYPES)[number]) => {
    if (!pharmacyId) {
      setError('Select an administered pharmacy before adding a personal profile.');
      return;
    }
    const savingKey = `${item.role}:${item.staffRole}`;
    setSaving(savingKey);
    setError(null);
    try {
      await chooseAccountType(item.role, {
        pharmacy_id: pharmacyId,
        staff_role: item.staffRole,
      });
      await refreshUser();
      router.replace(item.onboardingPath as any);
    } catch (err: any) {
      const data = err?.response?.data;
      setError(
        data?.role?.[0]
        || data?.staff_role?.[0]
        || data?.pharmacy_id?.[0]
        || err?.message
        || 'Unable to save your account type.',
      );
    } finally {
      setSaving(null);
    }
  };

  return (
    <Surface style={styles.card}>
      <Text variant="titleMedium" style={styles.title}>Personal profile is optional</Text>
      <Text style={styles.body}>
        This account can remain permanently as a pharmacy-admin account. No action is required. Only choose a worker
        type if this email belongs to you personally and you want the current pharmacy's CONTACT membership converted
        into your own workforce membership.
      </Text>
      <View style={styles.actions}>
        {ACCOUNT_TYPES.map((item) => (
          <Button
            key={`${item.role}:${item.staffRole}`}
            mode="outlined"
            loading={saving === `${item.role}:${item.staffRole}`}
            disabled={saving != null}
            onPress={() => choose(item)}
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
