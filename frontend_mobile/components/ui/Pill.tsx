import React, { memo, type ReactNode } from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, font, radius, space, touch } from '@/constants/tokens';
import { sizeIcon } from './icon';
import { ScalePressable } from './ScalePressable';
import { type StatusTone, toneColors } from './tone';

export type PillProps = {
  label: string;
  tone?: StatusTone;
  /** Lucide element, 13pt at stroke 2. */
  icon?: ReactNode;
  outlined?: boolean;
  /** Makes the pill a filter chip: outlined at rest, tinted in `tone` (violet for neutral) when selected. */
  onPress?: () => void;
  selected?: boolean;
  disabled?: boolean;
  /** Replaces the spoken text when the visible label needs context, e.g. "Status: Booked". */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

function PillLabel({ label, icon, color }: { label: string; icon?: ReactNode; color: string }) {
  return (
    <>
      {icon ? (
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {sizeIcon(icon, 13, color, 2)}
        </View>
      ) : null}
      <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.text, { color }]}>
        {label}
      </Text>
    </>
  );
}

/** Short label on a tinted background (role, status, source), or a filter chip when `onPress` is set. */
export const Pill = memo(function Pill({
  label,
  tone = 'neutral',
  icon,
  outlined = false,
  onPress,
  selected = false,
  disabled = false,
  accessibilityLabel,
  style,
}: PillProps) {
  if (onPress) {
    const on = toneColors(tone === 'neutral' ? 'violet' : tone);
    const fg = disabled ? colors.disabledFg : selected ? on.fg : colors.textSecondary;
    const bg = disabled ? colors.disabledBg : selected ? on.bg : colors.surfaceBg;
    return (
      <ScalePressable
        onPress={onPress}
        disabled={disabled}
        haptic="selection"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ selected, disabled }}
        style={[styles.chipTarget, style]}
      >
        <View
          style={[styles.pill, styles.chip, { backgroundColor: bg, borderColor: selected || disabled ? bg : colors.border }]}
        >
          <PillLabel label={label} icon={icon} color={fg} />
        </View>
      </ScalePressable>
    );
  }

  const { bg, fg } = toneColors(tone);
  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.pill,
        outlined
          ? { backgroundColor: colors.surfaceBg, borderColor: colors.border }
          : { backgroundColor: bg, borderColor: bg },
        style,
      ]}
    >
      <PillLabel label={label} icon={icon} color={outlined ? colors.textPrimary : fg} />
    </View>
  );
});

export type CountBadgeProps = {
  value: number;
  tone?: StatusTone;
  /** Spoken instead of the bare number, e.g. "3 unread notifications". */
  label?: string;
  style?: StyleProp<ViewStyle>;
};

/** Tabular count for unread, attention and candidate tallies. */
export const CountBadge = memo(function CountBadge({ value, tone = 'violet', label, style }: CountBadgeProps) {
  const { bg, fg } = toneColors(tone);
  return (
    <View accessible accessibilityLabel={label ?? String(value)} style={[styles.badge, { backgroundColor: bg }, style]}>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.badgeText, { color: fg }]}>
        {value}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    minHeight: 24,
    maxWidth: '100%',
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  // A 36pt chip inside a real touch.min box: hitSlop cannot reach past a tight parent, a layout box can.
  chipTarget: { alignSelf: 'flex-start', maxWidth: '100%', minWidth: touch.min, minHeight: touch.min, justifyContent: 'center' },
  chip: { alignSelf: 'auto', minHeight: 36, paddingHorizontal: space.md },
  text: { flexShrink: 1, fontFamily: font.inter.semiBold, fontSize: 12, lineHeight: 16 },
  badge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: font.inter.semiBold, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
});
