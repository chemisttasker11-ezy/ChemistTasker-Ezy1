import React, { type ReactNode } from 'react';
import { type StyleProp, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { colors, font, space, type } from '@/constants/tokens';

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  /** Buttons; under the title on phones, on the right from 640pt. */
  actions?: ReactNode;
  /** Row under the heading, e.g. SegmentTabs or a scope selector. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** The one header for inner screens (overviews use BrandBanner): Outfit title, a short line, actions. */
export function PageHeader({ title, subtitle, actions, children, style }: PageHeaderProps) {
  const { width } = useWindowDimensions();
  const wide = width >= 640;

  return (
    <View style={[styles.container, style]}>
      <View style={wide ? styles.rowLayout : null}>
        <View style={styles.titleBlock}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {actions ? <View style={[styles.actions, wide ? null : styles.actionsBelow]}>{actions}</View> : null}
      </View>
      {children ? <View style={styles.below}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: space.xl, minWidth: 0 },
  rowLayout: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space['2xl'] },
  titleBlock: { flexShrink: 1, minWidth: 0 },
  title: {
    color: colors.textPrimary,
    fontFamily: font.outfit.medium,
    fontSize: type.headlineLarge.fontSize,
    lineHeight: type.headlineLarge.lineHeight,
    letterSpacing: type.headlineLarge.letterSpacing,
  },
  subtitle: {
    marginTop: 6,
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodyLarge.fontSize,
    lineHeight: type.bodyLarge.lineHeight,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, flexShrink: 0 },
  actionsBelow: { marginTop: space.md },
  below: { marginTop: space.lg },
});
