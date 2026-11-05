import { useEffect, useState } from 'react';
import { runOnJS, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { durations, easings } from '@/constants/motion';

/**
 * Keeps an overlay mounted while it animates out. `progress` runs 0 -> 1 on open (250ms) and back
 * faster on close (150ms); with reduced motion both are plain 150ms fades driven by the same value.
 */
export function usePresence(open: boolean) {
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      progress.value = withTiming(1, {
        duration: reducedMotion ? durations.quick : durations.fast,
        easing: easings.smoothOut,
      });
    } else {
      progress.value = withTiming(0, { duration: durations.quick, easing: easings.smoothOut }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [open, progress, reducedMotion]);

  return { mounted, progress, reducedMotion };
}
