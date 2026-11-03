import React from 'react';
import { StyleSheet, type TextInstance, View } from 'react-native';
import { SectionCard } from '@/components/ui';
import { AuthLink, AuthNotice } from '@/components/AuthLayout';
import { space } from '@/constants/tokens';
import { GENDER_OPTIONS, ONBOARDING_STEPS, ROLE_OPTIONS, useOnboarding } from './_context';
import { ReviewRow, StepIntro } from './parts';

type ReviewProps = {
  titleRef: React.Ref<TextInstance>;
  onEdit: (step: number) => void;
};

/** Review: everything entered, grouped by step with an Edit link back to it; the footer saves. */
export default function OwnerOnboardingReview({ titleRef, onEdit }: ReviewProps) {
  const { form, showAhpra, photo, submitError } = useOnboarding();
  const name = [form.first_name, form.last_name].filter(Boolean).join(' ');
  const gender = GENDER_OPTIONS.find((option) => option.value === form.gender)?.label ?? 'Not set';
  const role = ROLE_OPTIONS.find((option) => option.value === form.role)?.label ?? form.role;
  const pharmacies = form.chain_pharmacy ? `${Math.max(1, form.number_of_pharmacies)} pharmacies` : 'One pharmacy';

  const edit = (step: number) => (
    <AuthLink label="Edit" accessibilityLabel={`Edit ${ONBOARDING_STEPS[step]}`} onPress={() => onEdit(step)} />
  );

  return (
    <View style={styles.stack}>
      <StepIntro titleRef={titleRef} title="Check your details" subtitle="You can change these later in your profile." />

      {submitError ? <AuthNotice tone="error" message={submitError} /> : null}

      <SectionCard title={ONBOARDING_STEPS[0]} action={edit(0)} dense>
        <ReviewRow label="Name" value={name || 'Not set'} />
        <ReviewRow label="Username" value={form.username || 'Not set'} />
        <ReviewRow label="Phone number" value={form.phone_number || 'Not set'} />
        <ReviewRow label="Gender" value={gender} />
        <ReviewRow label="Profile photo" value={photo.preview ? 'Added' : 'None'} />
      </SectionCard>

      <SectionCard title={ONBOARDING_STEPS[1]} action={edit(1)} dense>
        <ReviewRow label="Role" value={role} />
        {showAhpra ? <ReviewRow label="AHPRA number" value={form.ahpra_number || 'Not set'} /> : null}
      </SectionCard>

      <SectionCard title={ONBOARDING_STEPS[2]} action={edit(2)} dense>
        <ReviewRow label="Pharmacies" value={pharmacies} />
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.lg },
});
