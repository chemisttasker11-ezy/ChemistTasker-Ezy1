import React, { useCallback, useState } from 'react';
import {
  type GestureResponderEvent,
  type Insets,
  type LayoutChangeEvent,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors, touch } from '@/constants/tokens';
import { durations, easings, spring } from '@/constants/motion';

// The style lands on the Pressable itself, so flex / width / percentages lay out against the parent.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type HapticFeedbackType = 'none' | 'selection' | 'light' | 'medium' | 'success' | 'warning' | 'error';

const haptics: Record<Exclude<HapticFeedbackType, 'none'>, () => Promise<void>> = {
  selection: () => Haptics.selectionAsync(),
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};

/** DD1 §5 haptics matrix. Devices without a haptic engine reject; that is not an error for the user. */
export function triggerHaptic(kind: HapticFeedbackType) {
  if (kind !== 'none') haptics[kind]().catch(() => {});
}

export type ScalePressableProps = Omit<PressableProps, 'style' | 'children'> & {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Press scale for buttons and chips; clamped to 0.95..1 (make-interfaces-feel-better §12). */
  scaleValue?: number;
  /** No scale: rows, grid cells and links, where motion on every tap is noise. */
  static?: boolean;
  /** Tint faded in under the content while pressed: `true` = tokens pressBg, or a token colour. Without it the control dims. */
  pressBg?: boolean | string;
  haptic?: HapticFeedbackType;
};

/**
 * The one press primitive: tint or dim within 80ms, scale to 0.96 with a tight spring back, haptic on
 * press, hit area grown to tokens.touch.min. Runs on the UI thread (no re-render per press).
 * Reduced motion keeps the tint/dim and drops the scale.
 */
export function ScalePressable({
  children,
  style,
  scaleValue = 0.96,
  static: isStatic = false,
  pressBg,
  haptic = 'none',
  disabled,
  hitSlop,
  onLayout,
  onPressIn,
  onPressOut,
  onPress,
  accessibilityRole = 'button',
  accessibilityState,
  ...rest
}: ScalePressableProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const press = useSharedValue(0);
  const [autoSlop, setAutoSlop] = useState<Insets>();
  const target = isStatic || reducedMotion ? 1 : Math.min(1, Math.max(0.95, scaleValue));
  const tint = pressBg === true ? colors.pressBg : pressBg || undefined;

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onLayout?.(event);
      const { width, height } = event.nativeEvent.layout;
      const x = Math.max(0, Math.ceil((touch.min - width) / 2));
      const y = Math.max(0, Math.ceil((touch.min - height) / 2));
      setAutoSlop((prev) =>
        (prev?.left ?? 0) === x && (prev?.top ?? 0) === y
          ? prev
          : x || y
            ? { top: y, bottom: y, left: x, right: x }
            : undefined,
      );
    },
    [onLayout],
  );

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      press.value = withTiming(1, { duration: durations.micro, easing: easings.smoothOut });
      if (target < 1) scale.value = withTiming(target, { duration: durations.micro, easing: easings.smoothOut });
      onPressIn?.(event);
    },
    [onPressIn, press, scale, target],
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      press.value = withTiming(0, { duration: durations.quick, easing: easings.smoothOut });
      scale.value = withSpring(1, spring.tight);
      onPressOut?.(event);
    },
    [onPressOut, press, scale],
  );

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      triggerHaptic(haptic);
      onPress?.(event);
    },
    [haptic, onPress],
  );

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: tint ? 1 : 1 - press.value * 0.12,
  }));
  const tintStyle = useAnimatedStyle(() => ({ opacity: press.value }));
  const cornerRadius = tint ? StyleSheet.flatten(style)?.borderRadius : undefined;

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      hitSlop={hitSlop ?? autoSlop}
      onLayout={handleLayout}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: Boolean(disabled), ...accessibilityState }}
      style={[styles.base, style, pressStyle]}
    >
      {tint ? (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.tint, { backgroundColor: tint, borderRadius: cornerRadius }, tintStyle]}
        />
      ) : null}
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: { minWidth: 0 },
  tint: { pointerEvents: 'none' },
});
