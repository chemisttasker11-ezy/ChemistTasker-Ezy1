import React, { type ReactNode } from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { AlertCircle, Inbox, SearchX, ShieldAlert, WifiOff } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, font, radius, space, type } from '@/constants/tokens';
import { durations } from '@/constants/motion';
import { Button } from './Button';
import { sizeIcon } from './icon';
import { Skeleton } from './Skeleton';

export type ContentStateKind = 'loading' | 'empty' | 'error' | 'offline' | 'forbidden';

export type ContentStateProps = {
  kind: ContentStateKind;
  /** Defaults per kind; pass the page's own words where you can ("No shifts this week"). */
  title?: string;
  description?: string;
  /** The next step. Error and offline default to "Try again"; empty and forbidden show a button only when labelled. */
  actionLabel?: string;
  onAction?: () => void;
  /** Lucide element replacing the default glyph. */
  icon?: ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

const kinds = {
  empty: { title: 'Nothing here yet', description: undefined, action: undefined, tint: colors.tone.violet },
  error: {
    title: 'Something went wrong',
    description: 'The request could not be completed.',
    action: 'Try again',
    tint: { bg: colors.status.red.bg, fg: colors.status.red.fg },
  },
  offline: {
    title: "You're offline",
    description: 'Check your connection, then try again.',
    action: 'Try again',
    tint: { bg: colors.status.amber.bg, fg: colors.status.amber.fg },
  },
  forbidden: {
    title: 'No access',
    description: "You don't have access to this in your current workspace.",
    action: undefined,
    tint: { bg: colors.status.red.bg, fg: colors.status.red.fg },
  },
} as const;

function defaultIcon(kind: Exclude<ContentStateKind, 'loading'>, hasAction: boolean) {
  if (kind === 'error') return <AlertCircle />;
  if (kind === 'offline') return <WifiOff />;
  if (kind === 'forbidden') return <ShieldAlert />;
  return hasAction ? <SearchX /> : <Inbox />; // same rule as web DashboardContentState
}

/**
 * Every data state in one card: loading = skeleton rows shaped like content (never a bare spinner);
 * empty / error / offline / forbidden = tone tile, Outfit title, one line, one next step.
 */
export function ContentState({
  kind,
  title,
  description,
  actionLabel,
  onAction,
  icon,
  compact = false,
  style,
}: ContentStateProps) {
  if (kind === 'loading') {
    const label = title ?? 'Loading…';
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityState={{ busy: true }}
        style={[styles.card, styles.loading, compact ? styles.compact : null, style]}
      >
        {title ? <Text style={styles.loadingTitle}>{title}</Text> : null}
        {Array.from({ length: compact ? 2 : 3 }, (_, index) => (
          <View key={index} style={styles.skeletonRow}>
            <Skeleton width={44} height={44} borderRadius={radius.control} />
            <View style={styles.skeletonText}>
              <Skeleton width={index === 1 ? '60%' : '45%'} height={16} />
              <Skeleton width="75%" height={13} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  const preset = kinds[kind];
  const heading = title ?? preset.title;
  const line = description ?? preset.description;
  const label = actionLabel ?? preset.action;

  return (
    <Animated.View
      entering={FadeIn.duration(durations.fast)}
      accessibilityLiveRegion="polite"
      style={[styles.card, styles.state, compact ? styles.compact : null, style]}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[styles.tile, { backgroundColor: preset.tint.bg }]}
      >
        {sizeIcon(icon ?? defaultIcon(kind, Boolean(actionLabel)), 26, preset.tint.fg)}
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        {heading}
      </Text>
      {line ? <Text style={styles.description}>{line}</Text> : null}
      {label && onAction ? (
        <Button
          variant={kind === 'empty' ? 'primary' : 'outlined'}
          label={label}
          onPress={onAction}
          style={styles.action}
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceBg,
  },
  loading: { gap: 14, padding: space.xl },
  compact: { padding: space.lg },
  loadingTitle: {
    color: colors.textSecondary,
    fontFamily: font.inter.semiBold,
    fontSize: type.labelLarge.fontSize,
    lineHeight: type.labelLarge.lineHeight,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: space.md,
    borderRadius: radius.nested,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skeletonText: { flex: 1, minWidth: 0, gap: 6 },
  state: { alignItems: 'center', gap: 10, padding: space['2xl'] },
  tile: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: {
    maxWidth: 480,
    textAlign: 'center',
    color: colors.textPrimary,
    fontFamily: font.outfit.medium,
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: type.titleMedium.letterSpacing,
  },
  description: {
    maxWidth: 480,
    textAlign: 'center',
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodyMedium.fontSize,
    lineHeight: 22,
  },
  action: { marginTop: space.sm },
});
