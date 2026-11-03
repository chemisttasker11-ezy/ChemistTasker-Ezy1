import React, { type ReactNode, useCallback, useEffect, useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, elevation, font, radius, space, type } from '@/constants/tokens';
import { spring } from '@/constants/motion';
import { useOverlayFocus } from './useOverlayFocus';
import { usePresence } from './usePresence';

export type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  /** Sticky footer under the scrolling body, e.g. "Show 12 results" or "Done". */
  footer?: ReactNode;
  /** false while work is in flight: backdrop, swipe, Android back and the iOS escape gesture do nothing. */
  dismissable?: boolean;
  style?: StyleProp<ViewStyle>;
};

const CLOSE_DISTANCE = 72;
const CLOSE_VELOCITY = 600;

/**
 * Native bottom sheet for hints, scope/persona pickers and filters: slides up 250ms, leaves in 150ms,
 * drag the handle down to close, body scrolls under a fixed header and footer, clears the home
 * indicator and the keyboard. Reduced motion: a fade, no slide.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  dismissable = true,
  style,
}: BottomSheetProps) {
  const { mounted, progress, reducedMotion } = usePresence(open);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = useSharedValue(windowHeight);
  const drag = useSharedValue(0);
  const focus = useOverlayFocus(open);

  useEffect(() => {
    if (open) drag.value = 0;
  }, [drag, open]);

  const requestClose = useCallback(() => {
    if (dismissable) onClose();
  }, [dismissable, onClose]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(dismissable)
        .onUpdate((event) => {
          drag.value = Math.max(0, event.translationY);
        })
        .onEnd((event) => {
          if (event.translationY > CLOSE_DISTANCE || event.velocityY > CLOSE_VELOCITY) {
            runOnJS(requestClose)();
          } else {
            drag.value = withSpring(0, spring.tight);
          }
        }),
    [dismissable, drag, requestClose],
  );

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() =>
    reducedMotion
      ? { opacity: progress.value, transform: [{ translateY: drag.value }] }
      : { transform: [{ translateY: (1 - progress.value) * sheetHeight.value + drag.value }] },
  );

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}
      onShow={focus.onShow}
    >
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
          {/* Screen readers close with Android back or the iOS escape gesture, so the scrim stays out of their order. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={requestClose}
            accessible={false}
            importantForAccessibility="no"
          />
        </Animated.View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.dock}>
          <Animated.View
            accessibilityViewIsModal
            onAccessibilityEscape={requestClose}
            onLayout={(event) => {
              sheetHeight.value = event.nativeEvent.layout.height;
            }}
            style={[
              styles.sheet,
              {
                maxHeight: windowHeight - insets.top - space['3xl'],
                paddingBottom: Math.max(insets.bottom, space.lg),
              },
              sheetStyle,
              style,
            ]}
          >
            <GestureDetector gesture={pan}>
              <View style={styles.header}>
                {/* Without a title or subtitle the handle is what the screen reader lands on. */}
                <Text
                  ref={title || subtitle ? undefined : focus.target}
                  accessible={!title && !subtitle}
                  accessibilityLabel="Sheet"
                  style={styles.handle}
                />
                {title ? (
                  <Text ref={focus.target} accessibilityRole="header" style={styles.title}>
                    {title}
                  </Text>
                ) : null}
                {subtitle ? (
                  <Text ref={title ? undefined : focus.target} style={styles.subtitle}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            </GestureDetector>
            <ScrollView style={styles.body} bounces={false} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: { backgroundColor: colors.scrim },
  dock: { flex: 1, justifyContent: 'flex-end', pointerEvents: 'box-none' },
  sheet: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: space.xl,
    backgroundColor: colors.elevatedBg,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    ...elevation.floating,
  },
  header: { paddingTop: space.sm, paddingBottom: space.md },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    marginBottom: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.inputBorder,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: font.outfit.medium,
    fontSize: type.titleLarge.fontSize,
    lineHeight: type.titleLarge.lineHeight,
    letterSpacing: type.titleLarge.letterSpacing,
  },
  subtitle: {
    marginTop: space.xs,
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodyMedium.fontSize,
    lineHeight: type.bodyMedium.lineHeight,
  },
  body: { flexGrow: 0, flexShrink: 1 },
  footer: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
