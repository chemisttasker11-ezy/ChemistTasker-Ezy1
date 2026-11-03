import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, font, radius, space, type } from '@/constants/tokens';
import { durations, easings } from '@/constants/motion';

interface ProgressStepperProps {
  currentStep: number;
  totalSteps: number;
  steps: string[];
}

function Segment({ state }: { state: 'done' | 'current' | 'todo' }) {
  const reducedMotion = useReducedMotion();
  const fill = useSharedValue(state === 'todo' ? 0 : 1);

  useEffect(() => {
    const to = state === 'todo' ? 0 : 1;
    fill.value = reducedMotion ? to : withTiming(to, { duration: durations.fast, easing: easings.smoothOut });
  }, [fill, reducedMotion, state]);

  // scaleX from the left edge: the bar fills without re-laying out the row.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, fillStyle]} />
    </View>
  );
}

/** "Step 2 of 4 · Your role" over one segment per step; read as a single progress bar by screen readers. */
export default function ProgressStepper({ currentStep, totalSteps, steps }: ProgressStepperProps) {
  const label = steps[currentStep - 1] ?? '';

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${currentStep} of ${totalSteps}, ${label}`}
      accessibilityValue={{ min: 1, max: totalSteps, now: currentStep }}
      style={styles.container}
    >
      <Text style={styles.caption} maxFontSizeMultiplier={1.4}>
        <Text style={styles.count}>
          Step {currentStep} of {totalSteps}
        </Text>
        {label ? ` · ${label}` : ''}
      </Text>
      <View style={styles.segments}>
        {Array.from({ length: totalSteps }, (_, index) => (
          <Segment
            key={index}
            state={index + 1 < currentStep ? 'done' : index + 1 === currentStep ? 'current' : 'todo'}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.sm },
  caption: {
    color: colors.textSecondary,
    fontFamily: font.inter.medium,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  count: { color: colors.accentStrong, fontFamily: font.inter.semiBold, fontVariant: ['tabular-nums'] },
  segments: { flexDirection: 'row', gap: 6 },
  track: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    overflow: 'hidden',
  },
  fill: { flex: 1, backgroundColor: colors.primary, transformOrigin: 'left' },
});
