import React, { memo, type ReactNode } from 'react';
import { type StyleProp, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { colors, font, radius, space, type } from '@/constants/tokens';
import { IconTile } from './IconTile';
import { ScalePressable } from './ScalePressable';
import { Skeleton } from './Skeleton';
import type { Tone } from './tone';

export type MetricItem = {
  label: string;
  value: string | number;
  caption?: string;
  icon: ReactNode;
  tone: Tone;
  onPress?: () => void;
};

export type MetricStripProps = {
  items: MetricItem[];
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * One hairline card split into cells: 2 per row on phones (an odd last cell spans the row, no empty
 * cell), one row on tablets. Each cell: tone tile, label, Outfit tabular figure, caption.
 */
export const MetricStrip = memo(function MetricStrip({ items, loading = false, style }: MetricStripProps) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const count = items.length;
  const lastRowStart = count - (count % 2 === 0 ? 2 : 1);

  return (
    <View style={[styles.card, style]}>
      {items.map((item, index) => {
        const spansRow = !isTablet && index === count - 1 && count % 2 === 1;
        const placement: ViewStyle = isTablet
          ? { flex: 1, borderRightWidth: index < count - 1 ? 1 : 0 }
          : {
              width: spansRow ? '100%' : '50%',
              borderRightWidth: index % 2 === 0 && !spansRow ? 1 : 0,
              borderBottomWidth: index < lastRowStart ? 1 : 0,
            };
        const spoken = [item.label, loading ? 'loading' : String(item.value), item.caption].filter(Boolean).join(', ');
        const content = (
          <>
            <IconTile icon={item.icon} tone={item.tone} />
            <View style={styles.text}>
              <Text style={styles.label}>{item.label}</Text>
              {loading ? (
                <Skeleton width={48} height={24} style={styles.skeleton} />
              ) : (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  maxFontSizeMultiplier={1.2}
                  style={styles.value}
                >
                  {item.value}
                </Text>
              )}
              {item.caption ? <Text style={styles.caption}>{item.caption}</Text> : null}
            </View>
          </>
        );

        return item.onPress ? (
          <ScalePressable
            key={item.label}
            static
            pressBg
            onPress={item.onPress}
            accessibilityLabel={spoken}
            style={[styles.cell, placement]}
          >
            {content}
          </ScalePressable>
        ) : (
          <View key={item.label} accessible accessibilityLabel={spoken} style={[styles.cell, placement]}>
            {content}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceBg,
    overflow: 'hidden',
  },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    minWidth: 0,
    borderColor: colors.border,
  },
  text: { flex: 1, minWidth: 0 },
  label: {
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  value: {
    marginTop: space.xxs,
    color: colors.textPrimary,
    fontFamily: font.outfit.medium,
    fontSize: type.headlineMedium.fontSize,
    lineHeight: type.headlineMedium.lineHeight,
    letterSpacing: type.headlineMedium.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  caption: {
    marginTop: space.xxs,
    color: colors.textMuted,
    fontFamily: font.inter.regular,
    fontSize: type.labelSmall.fontSize,
    lineHeight: type.labelSmall.lineHeight,
  },
  skeleton: { marginVertical: space.xs },
});
