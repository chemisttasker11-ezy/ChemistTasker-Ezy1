import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { useIsFocused } from 'expo-router';

/**
 * Allows decorative motion only while its route is visible, the app is active,
 * and the operating system has not requested reduced motion.
 */
export function useAnimationEnabled() {
  const isFocused = useIsFocused();
  const [appState, setAppState] = useState(AppState.currentState);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(true);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotionEnabled(enabled);
    });

    const motionSubscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    );
    const appStateSubscription = AppState.addEventListener('change', setAppState);

    return () => {
      mounted = false;
      motionSubscription.remove();
      appStateSubscription.remove();
    };
  }, []);

  return isFocused && appState === 'active' && !reduceMotionEnabled;
}
