import React, { useEffect, useRef } from 'react';
import { StyleSheet, type TextInputInstance, View } from 'react-native';
import { Store, Network } from 'lucide-react-native';
import { TextField } from '@/components/ui';
import { space } from '@/constants/tokens';
import { useOnboarding } from './_context';
import { OptionCard, optionIconColor, StepIntro, type StepProps } from './parts';

/** Your pharmacies: one or several (web "Do you have more than one pharmacy?") and how many. */
export default function OwnerOnboardingStep3({ titleRef, attempt, onContinue }: StepProps) {
  const { form, update, errors } = useOnboarding();
  const countRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    if (attempt && errors.number_of_pharmacies) countRef.current?.focus();
    // Only a new Continue attempt moves focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return (
    <View style={styles.stack}>
      <StepIntro
        titleRef={titleRef}
        title="Your pharmacies"
        subtitle="Do you have more than one pharmacy? You'll add the first one next."
      />

      <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel="Do you have more than one pharmacy?">
        <OptionCard
          label="One pharmacy"
          icon={<Store size={20} color={optionIconColor(!form.chain_pharmacy)} strokeWidth={1.75} />}
          selected={!form.chain_pharmacy}
          // Same as web: answering No resets the count to 1.
          onPress={() => update({ chain_pharmacy: false, number_of_pharmacies: 1 })}
        />
        <OptionCard
          label="More than one"
          description="A group or chain of pharmacies."
          icon={<Network size={20} color={optionIconColor(form.chain_pharmacy)} strokeWidth={1.75} />}
          selected={form.chain_pharmacy}
          onPress={() => update({ chain_pharmacy: true })}
        />
      </View>

      {form.chain_pharmacy ? (
        <TextField
          ref={countRef}
          label="Number of pharmacies"
          value={form.number_of_pharmacies > 0 ? String(form.number_of_pharmacies) : ''}
          onChangeText={(value) => {
            // Empty stays empty while typing; Continue validates >= 1.
            const digits = value.replace(/\D/g, '');
            update({ number_of_pharmacies: digits ? Number(digits) : 0 });
          }}
          keyboardType="number-pad"
          returnKeyType="done"
          onSubmitEditing={onContinue}
          selectTextOnFocus
          error={errors.number_of_pharmacies}
          hint="You can add more pharmacies after setup as well."
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space['2xl'] },
  options: { gap: space.md },
});
