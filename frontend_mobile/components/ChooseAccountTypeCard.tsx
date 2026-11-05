import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { chooseAccountType } from '@chemisttasker/shared-core';
import { ConfirmDialog, ScalePressable, SectionCard } from '@/components/ui';
import { AuthNotice } from '@/components/AuthLayout';
import { colors, font, radius, space, touch, type } from '@/constants/tokens';

// A pharmacy-manager account may remain a permanent admin-only identity.
const ACCOUNT_TYPES = [
  { role: 'PHARMACIST', staffRole: 'PHARMACIST', label: 'Pharmacist', onboardingPath: '/pharmacist/onboarding' },
  { role: 'OTHER_STAFF', staffRole: 'INTERN', label: 'Intern pharmacist', onboardingPath: '/otherstaff/profile-basic-info' },
  { role: 'OTHER_STAFF', staffRole: 'TECHNICIAN', label: 'Dispensary technician', onboardingPath: '/otherstaff/profile-basic-info' },
  { role: 'OTHER_STAFF', staffRole: 'ASSISTANT', label: 'Pharmacy assistant', onboardingPath: '/otherstaff/profile-basic-info' },
  { role: 'OTHER_STAFF', staffRole: 'STUDENT', label: 'Pharmacy student', onboardingPath: '/otherstaff/profile-basic-info' },
] as const;

export default function ChooseAccountTypeCard({ pharmacyId }: { pharmacyId: number | null }) {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Choosing converts the account's role and membership, so a row only opens the confirmation.
  // `pending` outlives `confirmOpen` so the dialog keeps its title while it fades out.
  const [pending, setPending] = useState<(typeof ACCOUNT_TYPES)[number] | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

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
      setConfirmOpen(false);
      router.replace(item.onboardingPath as any);
    } catch (err: any) {
      setConfirmOpen(false);
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
    <SectionCard
      title="Personal profile is optional"
      subtitle="This account can stay a pharmacy admin account; nothing else is needed. If this email is yours personally, you can add your own worker profile and join this pharmacy's team as staff."
      style={styles.card}
    >
      {!pharmacyId ? (
        <AuthNotice tone="info" message="Select a pharmacy you manage before adding a personal profile." />
      ) : null}
      <View style={styles.list} accessibilityLabel="Worker type">
        {ACCOUNT_TYPES.map((item, index) => {
          const key = `${item.role}:${item.staffRole}`;
          const isSaving = saving === key;
          return (
            <ScalePressable
              key={key}
              pressBg
              disabled={saving != null || !pharmacyId}
              onPress={() => {
                setPending(item);
                setConfirmOpen(true);
              }}
              accessibilityLabel={`Add a personal ${item.label.toLowerCase()} profile`}
              accessibilityState={{ busy: isSaving }}
              style={[styles.row, index > 0 ? styles.rowDivider : null]}
            >
              <Text style={[styles.rowLabel, !pharmacyId || (saving != null && !isSaving) ? styles.rowLabelMuted : null]}>
                {item.label}
              </Text>
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <ChevronRight size={20} color={colors.textMuted} strokeWidth={1.75} />
              )}
            </ScalePressable>
          );
        })}
      </View>
      {error ? <View style={styles.error}><AuthNotice tone="error" message={error} /></View> : null}
      <ConfirmDialog
        open={confirmOpen}
        title={pending ? `Add a personal ${pending.label.toLowerCase()} profile?` : ''}
        body="This account becomes your own worker account, and your place at this pharmacy becomes a staff membership. You'll set up your profile next."
        confirmLabel="Add profile"
        busyLabel="Adding profile"
        busy={saving != null}
        destructive={false}
        onConfirm={() => pending && void choose(pending)}
        onClose={() => setConfirmOpen(false)}
      />
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: space.lg },
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.nested,
    overflow: 'hidden',
  },
  row: {
    minHeight: touch.min + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: colors.surfaceBg,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: font.inter.semiBold,
    fontSize: type.labelLarge.fontSize,
    lineHeight: type.labelLarge.lineHeight,
  },
  rowLabelMuted: { color: colors.textMuted },
  error: { marginTop: space.md },
});
