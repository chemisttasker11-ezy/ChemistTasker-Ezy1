import React, { type ReactNode, useEffect } from 'react';
import { type StyleProp, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, font, radius, space, touch, type } from '@/constants/tokens';
import { durations, easings } from '@/constants/motion';
import { sizeIcon } from './icon';
import { ScalePressable } from './ScalePressable';

export type SegmentTab<T extends string> = { value: T; label: string; icon?: ReactNode };

const tabId = (idPrefix: string, value: string) => `${idPrefix}-tab-${value}`;

/** Props for the view showing the selected section, so Android links it to its tab (web twin API). */
export function tabPanelProps(idPrefix: string, value: string) {
  return { nativeID: `${idPrefix}-panel`, accessibilityLabelledBy: tabId(idPrefix, value) } as const;
}

export type SegmentTabsProps<T extends string> = {
  tabs: SegmentTab<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the tab group for screen readers, e.g. "Shift views". */
  label: string;
  idPrefix?: string;
  /** Wrap 4-5 options onto rows (never scroll sideways). Also automatic for 4+ tabs under 390pt. */
  mobileWrap?: boolean;
  style?: StyleProp<ViewStyle>;
};

function Tab<T extends string>({
  tab,
  selected,
  wrap,
  idPrefix,
  onChange,
}: {
  tab: SegmentTab<T>;
  selected: boolean;
  wrap: boolean;
  idPrefix: string;
  onChange: (value: T) => void;
}) {
  const reducedMotion = useReducedMotion();
  const on = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    const to = selected ? 1 : 0;
    on.value = reducedMotion ? to : withTiming(to, { duration: durations.quick, easing: easings.smoothOut });
  }, [on, reducedMotion, selected]);

  const fill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [colors.surfaceBg, colors.tone.violet.bg]),
    borderColor: interpolateColor(on.value, [0, 1], [colors.border, colors.tone.violet.bg]),
  }));
  const ink = useAnimatedStyle(() => ({
    color: interpolateColor(on.value, [0, 1], [colors.textSecondary, colors.accentStrong]),
  }));
  const fg = selected ? colors.accentStrong : colors.textSecondary;

  return (
    <ScalePressable
      nativeID={tabId(idPrefix, tab.value)}
      scaleValue={0.98}
      haptic={selected ? 'none' : 'selection'}
      onPress={() => {
        if (!selected) onChange(tab.value);
      }}
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected }}
      style={wrap ? styles.wrapped : styles.equal}
    >
      <Animated.View style={[styles.tab, fill]}>
        {tab.icon ? (
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {sizeIcon(tab.icon, 16, fg)}
          </View>
        ) : null}
        <Animated.Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.15}
          style={[styles.label, { fontFamily: selected ? font.inter.semiBold : font.inter.medium }, ink]}
        >
          {tab.label}
        </Animated.Text>
      </Animated.View>
    </ScalePressable>
  );
}

/**
 * Pill tabs for 2-5 page sections (Shift Centre style): selected = soft violet with deep-violet
 * semibold, others white with a hairline. The fill cross-fades in 150ms; selection haptic.
 */
export function SegmentTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  idPrefix = 'ct-tabs',
  mobileWrap = false,
  style,
}: SegmentTabsProps<T>) {
  const { width } = useWindowDimensions();
  const wrap = mobileWrap || (tabs.length >= 4 && width < 390);

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={[styles.container, wrap ? styles.containerWrap : null, style]}
    >
      {tabs.map((tab) => (
        <Tab
          key={tab.value}
          tab={tab}
          selected={tab.value === value}
          wrap={wrap}
          idPrefix={idPrefix}
          onChange={onChange}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
    padding: 6,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceBg,
  },
  containerWrap: { flexWrap: 'wrap' },
  equal: { flex: 1, minWidth: 0 },
  wrapped: { flexGrow: 1, flexBasis: '30%', minWidth: 100 },
  tab: {
    flexGrow: 1,
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Web's phone padding: three icon tabs keep "Active shifts" whole at 360pt.
    gap: 6,
    paddingHorizontal: space.sm,
    borderRadius: radius.nested,
    borderWidth: 1,
  },
  label: { flexShrink: 1, fontSize: type.labelMedium.fontSize, lineHeight: type.labelMedium.lineHeight },
});
