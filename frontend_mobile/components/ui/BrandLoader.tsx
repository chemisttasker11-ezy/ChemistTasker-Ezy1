import React, { useEffect } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

export const BRAND_LOADER_SYMBOL = require('../../assets/images/splash-logo.png');
export const BRAND_LOADER_DURATION_MS = 1200;
export const BRAND_LOADER_DEFAULT_OPACITY = 0.65;
export const BRAND_LOADER_DEFAULT_SIZE = 44;
export const BRAND_LOADER_SCALE = 1.7;

export type BrandLoaderProps = {
  /** Size in points (both width and height). Defaults to 44. */
  size?: number;
  /** Faint/unobtrusive opacity for light styling. Defaults to 0.65. */
  opacity?: number;
  /** Accessible progress label. Defaults to 'Loading…'. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** Whether the indicator is actively animating/rotating. Defaults to true. If false, shows static mark. */
  animating?: boolean;
};

/**
 * Centered, lightweight ChemistTasker brand mark rotating continuously clockwise.
 * Uses PR248 splash-logo.png scaled ~1.7 to compensate for native transparent padding.
 * Respects system reduced-motion preference and animating=false with a static centered mark.
 */
export function BrandLoader({
  size = BRAND_LOADER_DEFAULT_SIZE,
  opacity = BRAND_LOADER_DEFAULT_OPACITY,
  accessibilityLabel = 'Loading…',
  style,
  animating = true,
}: BrandLoaderProps) {
  const reducedMotion = useReducedMotion();
  const rotation = useSharedValue(0);

  const shouldAnimate = animating && !reducedMotion;

  useEffect(() => {
    if (!shouldAnimate) {
      rotation.value = 0;
      return;
    }
    rotation.value = 0;
    // Positive 0deg -> 360deg rotation on the UI thread = continuous clockwise rotation
    rotation.value = withRepeat(
      withTiming(360, { duration: BRAND_LOADER_DURATION_MS, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(rotation);
  }, [shouldAnimate, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }, { scale: BRAND_LOADER_SCALE }],
  }));

  const staticStyle = {
    transform: [{ scale: BRAND_LOADER_SCALE }],
  };

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: animating }}
      style={[styles.container, { width: size, height: size }, style]}
    >
      <Animated.Image
        source={BRAND_LOADER_SYMBOL}
        style={[
          styles.mark,
          { width: size, height: size, opacity },
          shouldAnimate ? animatedStyle : staticStyle,
        ]}
        resizeMode="contain"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  mark: {
    alignSelf: 'center',
  },
});
