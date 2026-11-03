import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, type TextInput, View } from 'react-native';
import { BriefcaseBusiness, CircleCheck, CircleX, Clock3, Pill as PillIcon } from 'lucide-react-native';
import AhpraStatus from '@/components/AhpraStatus';
import { Pill, TextField } from '@/components/ui';
import { AHPRA_CONSENT_TEXT } from '@/constants/ahpraConsent';
import { colors, font, space, type } from '@/constants/tokens';
import { ROLE_OPTIONS, useOnboarding } from './_context';
import { OptionCard, optionIconColor, StepIntro, type StepProps, SUBMIT_LABEL } from './parts';

const ROLE_COPY = {
  MANAGER: { description: 'You run the pharmacy and its team.', Icon: BriefcaseBusiness },
  PHARMACIST: { description: 'Needs your AHPRA registration number.', Icon: PillIcon },
} as const;

/** Your role: Pharmacy Manager or Pharmacist, then AHPRA when it applies (same rules as web). */
export default function OwnerOnboardingStep2({ titleRef, attempt, onContinue }: StepProps) {
  const { form, update, errors, showAhpra, isAhpraVerified, ahpraSummary } = useOnboarding();
  const ahpraRef = useRef<TextInput>(null);

  useEffect(() => {
    if (attempt && errors.ahpra_number) ahpraRef.current?.focus();
    // Only a new Continue attempt moves focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const verification =
    form.ahpra_verified === true
      ? { tone: 'green' as const, Icon: CircleCheck, label: 'AHPRA verified' }
      : form.ahpra_verified === false
        ? { tone: 'red' as const, Icon: CircleX, label: 'AHPRA not verified' }
        : { tone: 'amber' as const, Icon: Clock3, label: 'AHPRA pending' };

  return (
    <View style={styles.stack}>
      <StepIntro titleRef={titleRef} title="Your role" subtitle="How do you work in your pharmacy?" />

      <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel="Your role">
        {ROLE_OPTIONS.map((option) => {
          const selected = form.role === option.value;
          const { description, Icon } = ROLE_COPY[option.value];
          return (
            <OptionCard
              key={option.value}
              label={option.label}
              description={description}
              icon={<Icon size={20} color={optionIconColor(selected)} strokeWidth={1.75} />}
              selected={selected}
              onPress={() => update({ role: option.value })}
            />
          );
        })}
      </View>

      <AhpraStatus submitLabel={SUBMIT_LABEL} />

      {showAhpra ? (
        <View style={styles.ahpra}>
          <TextField
            ref={ahpraRef}
            label={form.role === 'PHARMACIST' ? 'AHPRA number' : 'AHPRA number (optional)'}
            value={form.ahpra_number}
            onChangeText={(value) => update({ ahpra_number: value })}
            editable={!isAhpraVerified}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={onContinue}
            error={errors.ahpra_number}
            hint={isAhpraVerified ? 'AHPRA number is locked after verification.' : AHPRA_CONSENT_TEXT}
          />
          <TextField
            label="Years since first registration"
            value={
              form.ahpra_years_since_first_registration != null
                ? String(form.ahpra_years_since_first_registration)
                : ''
            }
            placeholder="Filled in after the AHPRA check"
            editable={false}
          />
          {!ahpraSummary ? (
            <View style={styles.verification}>
              <Pill tone={verification.tone} icon={<verification.Icon />} label={verification.label} />
              {form.ahpra_verification_note ? (
                <Text style={styles.note}>{form.ahpra_verification_note}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space['2xl'] },
  options: { gap: space.md },
  ahpra: { gap: space.lg },
  verification: { gap: space.sm },
  note: {
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
});
