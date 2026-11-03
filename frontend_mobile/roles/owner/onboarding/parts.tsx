import React, { type ReactNode, type Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScalePressable } from '@/components/ui';
import { colors, font, radius, space, type } from '@/constants/tokens';

/** The review step's save button; AhpraStatus names it in its fix-and-recheck hint. */
export const SUBMIT_LABEL = 'Save and continue';

/** What the flow host passes every step body. */
export type StepProps = {
  titleRef: Ref<Text>;
  /** Bumps each time Continue finds an error on this step, so the step focuses its first invalid field. */
  attempt: number;
  onContinue: () => void;
};

/** Step title and one supporting line; the title is the screen's header (and focus target) for screen readers. */
export function StepIntro({ title, subtitle, titleRef }: { title: string; subtitle?: string; titleRef?: Ref<Text> }) {
  return (
    <View style={styles.intro}>
      <Text ref={titleRef} accessibilityRole="header" style={styles.title} maxFontSizeMultiplier={1.5}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

type OptionCardProps = {
  label: string;
  description?: string;
  icon?: ReactNode;
  selected: boolean;
  onPress: () => void;
};

/** One answer of a single-choice question: a full-width radio row, violet when chosen. */
export function OptionCard({ label, description, icon, selected, onPress }: OptionCardProps) {
  return (
    <ScalePressable
      onPress={onPress}
      haptic="selection"
      scaleValue={0.98}
      accessibilityRole="radio"
      accessibilityLabel={description ? `${label}. ${description}` : label}
      accessibilityState={{ checked: selected }}
      style={[styles.option, selected ? styles.optionOn : null]}
    >
      {icon ? (
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={[styles.optionIcon, selected ? styles.optionIconOn : null]}
        >
          {icon}
        </View>
      ) : null}
      <View style={styles.optionText}>
        <Text style={styles.optionLabel}>{label}</Text>
        {description ? <Text style={styles.optionDescription}>{description}</Text> : null}
      </View>
      <View style={[styles.radio, selected ? styles.radioOn : null]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </ScalePressable>
  );
}

/** Label/value line for the review step. */
export function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export const optionIconColor = (selected: boolean) => (selected ? colors.accentStrong : colors.textSecondary);

const styles = StyleSheet.create({
  intro: { gap: space.xs },
  title: {
    color: colors.textPrimary,
    fontFamily: type.headlineMedium.fontFamily,
    fontSize: type.headlineMedium.fontSize,
    lineHeight: type.headlineMedium.lineHeight,
    letterSpacing: type.headlineMedium.letterSpacing,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodyLarge.fontSize,
    lineHeight: type.bodyLarge.lineHeight,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.nested,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceBg,
  },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.tone.violet.bg },
  // 14pt card, 12pt vertical padding: a 9pt tile keeps the corners concentric enough at this size.
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.tileSm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.subtleBg,
  },
  optionIconOn: { backgroundColor: colors.surfaceBg },
  optionText: { flex: 1, minWidth: 0, gap: 2 },
  optionLabel: {
    color: colors.textPrimary,
    fontFamily: font.inter.semiBold,
    fontSize: type.bodyLarge.fontSize,
    lineHeight: 21,
  },
  optionDescription: {
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceBg,
  },
  radioOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  radioDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceBg },
  row: { gap: 2, paddingVertical: space.sm },
  rowLabel: {
    color: colors.textSecondary,
    fontFamily: font.inter.medium,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  rowValue: {
    color: colors.textPrimary,
    fontFamily: font.inter.regular,
    fontSize: type.bodyLarge.fontSize,
    lineHeight: 21,
  },
});
