import React, { type ReactNode } from 'react';
import { type StyleProp, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, font, radius, space, touch, type } from '@/constants/tokens';
import { sizeIcon } from './icon';
import { type HapticFeedbackType, ScalePressable } from './ScalePressable';
import { alpha } from './tone';

export type BannerAction = { label: string; icon?: ReactNode; onPress: () => void; haptic?: HapticFeedbackType };

export type BrandBannerProps = {
  title: string;
  subtitle?: string;
  /** White button; Medium haptic by default (it is the screen's hero action, e.g. Post shift). */
  primary?: BannerAction;
  secondary?: BannerAction;
  /** Glass panel beside the text on tablets, under it on phones (e.g. pill balance). */
  aside?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

// Web brandPanelBackground (#02184B -> #1F1777 -> #3A1BA6 -> #4A33C2 -> #0280D6 at 104deg) in brand tokens.
export const brandBannerGradientColors = [
  colors.brandNavy,
  colors.accentStrong,
  colors.primary,
  colors.tone.blue.fg,
] as const;

// On-gradient glass and glow fills (web panel opacities over brand tokens); they only ever sit on the gradient.
const glass = {
  fill: alpha(colors.surfaceBg, 0.1),
  pressed: alpha(colors.surfaceBg, 0.18),
  border: alpha(colors.surfaceBg, 0.32),
  panelBorder: alpha(colors.surfaceBg, 0.24),
  violetGlow: alpha(colors.secondary, 0.2),
  blueGlow: alpha(colors.tone.blue.fg, 0.42),
};

function BannerButton({ action, kind }: { action: BannerAction; kind: 'primary' | 'secondary' }) {
  const fg = kind === 'primary' ? colors.accentStrong : colors.surfaceBg;
  return (
    <ScalePressable
      onPress={action.onPress}
      pressBg={kind === 'primary' ? colors.tone.violet.bg : glass.pressed}
      haptic={action.haptic ?? (kind === 'primary' ? 'medium' : 'none')}
      accessibilityLabel={action.label}
      style={[styles.button, kind === 'primary' ? styles.primary : styles.secondary]}
    >
      {sizeIcon(action.icon, 18, fg, 2)}
      <Text style={[styles.buttonText, { color: fg }]}>{action.label}</Text>
    </ScalePressable>
  );
}

/** Overview welcome panel: navy-to-violet-to-blue gradient, Outfit greeting, one hero and one secondary action. */
export function BrandBanner({ title, subtitle, primary, secondary, aside, style }: BrandBannerProps) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  return (
    <LinearGradient
      colors={brandBannerGradientColors}
      locations={[0, 0.42, 0.76, 1]}
      start={{ x: 0, y: 0.3 }}
      end={{ x: 1, y: 0.7 }}
      style={[styles.banner, isTablet ? styles.bannerTablet : null, style]}
    >
      <View style={[styles.glow, styles.violetGlow]} />
      <View style={[styles.glow, styles.blueGlow]} />
      <View style={[styles.content, isTablet && aside ? styles.contentRow : null]}>
        <View style={styles.main}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {primary || secondary ? (
            <View style={styles.actions}>
              {primary ? <BannerButton action={primary} kind="primary" /> : null}
              {secondary ? <BannerButton action={secondary} kind="secondary" /> : null}
            </View>
          ) : null}
        </View>
        {aside ? <View style={[styles.aside, isTablet ? styles.asideTablet : null]}>{aside}</View> : null}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  banner: {
    overflow: 'hidden',
    borderRadius: radius.banner,
    paddingHorizontal: space.xl,
    paddingVertical: space['2xl'],
  },
  bannerTablet: { paddingHorizontal: space['3xl'], paddingVertical: space['3xl'] },
  glow: { position: 'absolute', borderRadius: radius.pill, pointerEvents: 'none' },
  violetGlow: { top: -64, right: -36, width: 220, height: 220, backgroundColor: glass.violetGlow },
  blueGlow: { bottom: -90, right: 60, width: 200, height: 200, backgroundColor: glass.blueGlow },
  content: { gap: space['2xl'] },
  contentRow: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1, minWidth: 0 },
  title: {
    color: colors.surfaceBg,
    fontFamily: font.outfit.medium,
    fontSize: type.displayMedium.fontSize,
    lineHeight: type.displayMedium.lineHeight,
    letterSpacing: type.displayMedium.letterSpacing,
  },
  subtitle: {
    marginTop: 10,
    maxWidth: 560,
    color: colors.tone.violet.bg,
    fontFamily: font.inter.regular,
    fontSize: type.bodyMedium.fontSize,
    lineHeight: 22,
  },
  // Buttons share the row equally on phones and wrap to full width when the labels do not fit.
  actions: { marginTop: space.xl, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: {
    flexGrow: 1,
    minHeight: touch.min,
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  primary: { backgroundColor: colors.surfaceBg, borderColor: colors.surfaceBg },
  secondary: { backgroundColor: glass.fill, borderColor: glass.border },
  buttonText: { flexShrink: 1, textAlign: 'center', fontFamily: font.inter.semiBold, fontSize: 13.5, lineHeight: 19 },
  aside: {
    minWidth: 0,
    padding: 18,
    borderRadius: radius.nested,
    borderWidth: 1,
    borderColor: glass.panelBorder,
    backgroundColor: glass.fill,
  },
  asideTablet: { width: 300, flexShrink: 0 },
});
