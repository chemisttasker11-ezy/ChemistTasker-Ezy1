import React, { type ReactNode } from 'react';
import { ActivityIndicator, type StyleProp, StyleSheet, Text, type ViewStyle } from 'react-native';
import { colors, font, radius, space, touch, type } from '@/constants/tokens';
import { sizeIcon } from './icon';
import { type HapticFeedbackType, ScalePressable } from './ScalePressable';

export type ButtonVariant = 'primary' | 'outlined' | 'destructive';

const palette: Record<ButtonVariant, { bg: string; fg: string; border: string; pressed: string }> = {
  primary: { bg: colors.primary, fg: colors.surfaceBg, border: colors.primary, pressed: colors.primaryPressed },
  outlined: { bg: colors.surfaceBg, fg: colors.accentStrong, border: colors.border, pressed: colors.pressBg },
  destructive: {
    bg: colors.status.red.solid,
    fg: colors.surfaceBg,
    border: colors.status.red.solid,
    pressed: colors.status.red.fg,
  },
};

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: ReactNode;
  /** Keeps the variant colour, shows a spinner and `busyLabel`, and ignores presses. */
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  /** DD1 §5: `medium` for workflow CTAs (post shift, reveal, assign, clock in). */
  haptic?: HapticFeedbackType;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

/** The kit's action button: 44/48pt, 12pt radius, Inter 600, press tint + 0.96 scale. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  busy = false,
  busyLabel,
  disabled = false,
  haptic = 'none',
  accessibilityLabel,
  accessibilityHint,
  style,
}: ButtonProps) {
  const p = palette[variant];
  const off = disabled && !busy;
  const fg = off ? colors.disabledFg : p.fg;
  const text = busy && busyLabel ? busyLabel : label;

  return (
    <ScalePressable
      onPress={onPress}
      disabled={disabled || busy}
      pressBg={p.pressed}
      haptic={haptic}
      accessibilityLabel={accessibilityLabel ?? text}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={[
        styles.base,
        { backgroundColor: off ? colors.disabledBg : p.bg, borderColor: off ? colors.disabledBg : p.border },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : sizeIcon(icon, 18, fg, 2)}
      <Text style={[styles.label, { color: fg }]}>{text}</Text>
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch.min,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  label: {
    flexShrink: 1,
    textAlign: 'center',
    fontFamily: font.inter.semiBold,
    fontSize: type.labelLarge.fontSize,
    lineHeight: type.labelLarge.lineHeight,
  },
});
