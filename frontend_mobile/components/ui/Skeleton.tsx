import React, { useEffect } from 'react';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius } from '@/constants/tokens';

const PULSE_MS = 1100; // DD1 §5: opacity 0.45 <-> 0.9, linear

/** Placeholder block shaped like the content it stands in for. Holds still under reduced motion. */
export function Skeleton({
  width,
  height,
  borderRadius = radius.tileSm,
  style,
}: {
  width: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0.65);

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 0.65;
      return;
    }
    opacity.value = 0.45;
    opacity.value = withRepeat(withTiming(0.9, { duration: PULSE_MS, easing: Easing.linear }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity, reducedMotion]);

  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[{ width, height, borderRadius, backgroundColor: colors.border }, pulse, style]}
    />
  );
}
