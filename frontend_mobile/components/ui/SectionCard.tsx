import React, { type ReactNode } from 'react';
import { type StyleProp, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, font, radius, space, touch, type } from '@/constants/tokens';
import { durations, easings } from '@/constants/motion';
import { sizeIcon } from './icon';
import { ScalePressable } from './ScalePressable';

export type ViewAllLinkProps = {
  children: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** "View all shifts ->" link: deep-violet Inter 600, the arrow nudges 2pt while pressed. */
export function ViewAllLink({ children, onPress, disabled = false, accessibilityLabel, style }: ViewAllLinkProps) {
  const reducedMotion = useReducedMotion();
  const nudge = useSharedValue(0);
  const arrowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: nudge.value }] }));
  const moveArrow = (to: number) => {
    if (!reducedMotion) nudge.value = withTiming(to, { duration: durations.quick, easing: easings.smoothOut });
  };
  const fg = disabled ? colors.textMuted : colors.accentStrong;

  return (
    <ScalePressable
      static
      onPress={onPress}
      onPressIn={() => moveArrow(2)}
      onPressOut={() => moveArrow(0)}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? children}
      style={[styles.link, style]}
    >
      <Text style={[styles.linkText, { color: fg }]}>{children}</Text>
      <Animated.View style={arrowStyle}>
        <ArrowRight size={16} color={fg} strokeWidth={2} />
      </Animated.View>
    </ScalePressable>
  );
}

export type SectionCardProps = {
  title?: ReactNode;
  /** Lucide element shown before the title in deep violet. */
  icon?: ReactNode;
  subtitle?: ReactNode;
  /** Right-hand header slot, usually a ViewAllLink or a CountBadge. */
  action?: ReactNode;
  children?: ReactNode;
  dense?: boolean;
  /** Body runs edge to edge (lists with their own row padding); the header keeps the card padding. */
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Flat 20pt card: 1pt hairline border, no shadow, Outfit title with an optional outline icon. */
export function SectionCard({
  title,
  icon,
  subtitle,
  action,
  children,
  dense = false,
  flush = false,
  style,
}: SectionCardProps) {
  const { width } = useWindowDimensions();
  const pad = dense ? space.lg : width >= 768 ? space['2xl'] : space.xl;
  const hasHeader = Boolean(title || subtitle || action);

  return (
    <View style={[styles.card, flush ? styles.flush : { padding: pad }, style]}>
      {hasHeader ? (
        <View
          style={[
            styles.header,
            { marginBottom: subtitle ? space.lg : action ? space.xs : space.md },
            flush ? { paddingHorizontal: pad, paddingTop: pad } : null,
          ]}
        >
          <View style={styles.heading}>
            {title ? (
              <View style={styles.titleRow}>
                {icon ? (
                  <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                    {sizeIcon(icon, 20, colors.accentStrong)}
                  </View>
                ) : null}
                <Text accessibilityRole="header" style={styles.title}>
                  {title}
                </Text>
              </View>
            ) : null}
            {subtitle ? <Text style={[styles.subtitle, title ? styles.subtitleUnder : null]}>{subtitle}</Text> : null}
          </View>
          {action ? <View style={styles.action}>{action}</View> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceBg,
    minWidth: 0,
  },
  flush: { overflow: 'hidden' },
  // Title and subtitle stay together on the left, centred as one block against the action's touch box.
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  heading: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontFamily: font.outfit.medium,
    fontSize: type.titleMedium.fontSize,
    lineHeight: type.titleMedium.lineHeight,
    letterSpacing: type.titleMedium.letterSpacing,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  subtitleUnder: { marginTop: space.xs },
  // Reserves the full touch.min box, so the link's target is laid out (never overlaps or clips); the
  // box already adds air under a centred title, so an action-only header keeps just 4pt below it.
  action: { flexShrink: 0, minHeight: touch.min, justifyContent: 'center' },
  link: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minWidth: touch.min,
    minHeight: touch.min,
    paddingHorizontal: space.xxs,
    borderRadius: radius.tileSm,
  },
  linkText: {
    fontFamily: font.inter.semiBold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
});
