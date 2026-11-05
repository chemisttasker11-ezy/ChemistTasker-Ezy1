import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, type TextInputInstance, View } from 'react-native';
import { Camera, CircleCheck, Clock3 } from 'lucide-react-native';
import { Button, InitialsAvatar, Pill, TextField } from '@/components/ui';
import { AuthLink } from '@/components/AuthLayout';
import { colors, font, space, type } from '@/constants/tokens';
import { GENDER_OPTIONS, type OwnerForm, useOnboarding } from './_context';
import { StepIntro, type StepProps } from './parts';

type TextKey = 'first_name' | 'last_name' | 'username' | 'phone_number';
const FIELD_ORDER: TextKey[] = ['first_name', 'last_name', 'username', 'phone_number'];
const LOCKED_HINT = 'Locked after initial registration.';

/** About you: photo, legal name, username, phone and gender (web OwnerOnboarding "Profile"). */
export default function OwnerOnboardingStep1({ titleRef, attempt, onContinue }: StepProps) {
  const { form, update, errors, lockedNames, isMobileVerified, photo, pickPhoto, removePhoto } = useOnboarding();
  const refs = useRef<Partial<Record<TextKey, TextInputInstance | null>>>({});

  const editable = (key: TextKey) =>
    !(key === 'first_name' && lockedNames.first) &&
    !(key === 'last_name' && lockedNames.last) &&
    !(key === 'phone_number' && isMobileVerified && Boolean(form.phone_number.trim()));
  const editableOrder = FIELD_ORDER.filter(editable);
  const isLast = (key: TextKey) => editableOrder[editableOrder.length - 1] === key;
  const focusAfter = (key: TextKey) => {
    const next = editableOrder[editableOrder.indexOf(key) + 1];
    if (next) refs.current[next]?.focus();
    else onContinue();
  };

  useEffect(() => {
    if (!attempt) return;
    const first = FIELD_ORDER.find((key) => errors[key] && editable(key));
    if (first) refs.current[first]?.focus();
    // Only a new Continue attempt moves focus; typing elsewhere must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const field = (key: TextKey) => ({
    ref: (node: TextInputInstance | null) => {
      refs.current[key] = node;
    },
    value: form[key],
    onChangeText: (value: string) => update({ [key]: value } as Partial<OwnerForm>),
    error: errors[key],
    editable: editable(key),
    returnKeyType: isLast(key) ? ('done' as const) : ('next' as const),
    submitBehavior: isLast(key) ? ('blurAndSubmit' as const) : ('submit' as const),
    onSubmitEditing: () => focusAfter(key),
  });

  const displayName = [form.first_name, form.last_name].filter(Boolean).join(' ').trim() || form.username;

  return (
    <View style={styles.stack}>
      <StepIntro
        titleRef={titleRef}
        title="About you"
        subtitle="Finish your profile so your pharmacy workspace can be set up without delays."
      />

      <View style={styles.photoRow}>
        <InitialsAvatar name={displayName || 'You'} photoUrl={photo.preview} size={64} />
        <View style={styles.photoText}>
          <Text style={styles.photoLabel}>Profile photo</Text>
          <Text style={styles.photoHint}>Optional</Text>
        </View>
        <View style={styles.photoActions}>
          <Button
            variant="outlined"
            label={photo.preview ? 'Change' : 'Add photo'}
            accessibilityLabel={photo.preview ? 'Change profile photo' : 'Add profile photo'}
            icon={<Camera />}
            onPress={() => void pickPhoto()}
          />
          {photo.preview ? (
            <AuthLink label="Remove" accessibilityLabel="Remove profile photo" onPress={removePhoto} />
          ) : null}
        </View>
      </View>

      <View style={styles.fields}>
        <TextField
          label="First name"
          required
          autoComplete="given-name"
          textContentType="givenName"
          autoCapitalize="words"
          hint={lockedNames.first ? LOCKED_HINT : undefined}
          {...field('first_name')}
        />
        <TextField
          label="Last name"
          required
          autoComplete="family-name"
          textContentType="familyName"
          autoCapitalize="words"
          hint={lockedNames.last ? LOCKED_HINT : undefined}
          {...field('last_name')}
        />
        <TextField
          label="Username"
          required
          autoComplete="username-new"
          textContentType="username"
          autoCapitalize="none"
          autoCorrect={false}
          {...field('username')}
        />
        <View style={styles.phone}>
          <TextField
            label="Phone number"
            required
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            {...field('phone_number')}
          />
          <Pill
            tone={isMobileVerified ? 'green' : 'amber'}
            icon={isMobileVerified ? <CircleCheck /> : <Clock3 />}
            label={isMobileVerified ? 'Mobile verified' : 'Mobile not verified'}
          />
        </View>
      </View>

      <View
        style={styles.gender}
        accessibilityRole="radiogroup"
        accessibilityLabel="Gender, optional"
      >
        <Text style={styles.groupLabel} importantForAccessibility="no" accessibilityElementsHidden>
          Gender <Text style={styles.optional}>(optional)</Text>
        </Text>
        <View style={styles.chips}>
          {GENDER_OPTIONS.map((option) => (
            <Pill
              key={option.value}
              label={option.label}
              selected={form.gender === option.value}
              // Tapping the chosen chip again clears it, like web's empty "Select gender" option.
              onPress={() => update({ gender: form.gender === option.value ? '' : option.value })}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space['2xl'] },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  photoText: { flex: 1, minWidth: 120, gap: 2 },
  photoLabel: {
    color: colors.textPrimary,
    fontFamily: font.inter.semiBold,
    fontSize: type.labelLarge.fontSize,
    lineHeight: type.labelLarge.lineHeight,
  },
  photoHint: {
    flexShrink: 1,
    color: colors.textMuted,
    fontFamily: font.inter.regular,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  photoActions: { alignItems: 'center' },
  fields: { gap: space.lg },
  phone: { gap: space.sm },
  gender: { gap: space.sm },
  groupLabel: {
    color: colors.textPrimary,
    fontFamily: font.inter.medium,
    fontSize: type.labelLarge.fontSize,
    lineHeight: type.labelLarge.lineHeight,
  },
  optional: { color: colors.textMuted, fontFamily: font.inter.regular },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
