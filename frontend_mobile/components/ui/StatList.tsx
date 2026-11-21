import React, { memo } from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, font, space, type } from '@/constants/tokens';
import { Skeleton } from './Skeleton';

export type StatRow = { label: string; value: string | number };

export type StatListProps = { rows: StatRow[]; loading?: boolean; style?: StyleProp<ViewStyle> };

/** Label left, large deep-violet tabular figure right, hairline between rows. Each row reads as one item. */
export const StatList = memo(function StatList({ rows, loading = false, style }: StatListProps) {
  return (
    <View style={style}>
      {rows.map((row, index) => (
        <View
          key={row.label}
          accessible
          accessibilityLabel={`${row.label}: ${loading ? 'loading' : row.value}`}
          style={[styles.row, index > 0 ? styles.divider : null]}
        >
          <Text style={styles.label}>{row.label}</Text>
          {loading ? (
            <Skeleton width={32} height={24} />
          ) : (
            <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.value}>
              {row.value}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.md,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  label: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: 13.5,
    lineHeight: 20,
  },
  value: {
    color: colors.accentStrong,
    fontFamily: font.outfit.medium,
    fontSize: type.headlineLarge.fontSize,
    lineHeight: type.headlineLarge.lineHeight,
    letterSpacing: type.headlineLarge.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
});
