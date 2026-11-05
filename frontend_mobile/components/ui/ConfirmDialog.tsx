import React, { type ReactNode, useCallback, useEffect } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, elevation, font, radius, space, type } from '@/constants/tokens';
import { Button } from './Button';
import { triggerHaptic } from './ScalePressable';
import { useOverlayFocus } from './useOverlayFocus';
import { usePresence } from './usePresence';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * Confirms a consequential action: names it, explains it, shows progress and locks while working
 * (no backdrop, back or escape dismissal while busy). Scales up from 0.96; reduced motion fades.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  busyLabel,
  busy,
  destructive = true,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const { mounted, progress, reducedMotion } = usePresence(open);
  const insets = useSafeAreaInsets();
  const focus = useOverlayFocus(open);

  useEffect(() => {
    if (open && destructive) triggerHaptic('warning');
  }, [destructive, open]);

  const requestClose = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const dialogStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: reducedMotion ? 1 : 0.96 + 0.04 * progress.value }],
  }));

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
      <View
        style={[styles.overlay, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg }]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={requestClose}
            accessible={false}
            importantForAccessibility="no"
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          onAccessibilityEscape={requestClose}
          style={[styles.dialog, dialogStyle]}
        >
          <Text ref={focus.target} accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <ScrollView style={styles.body} bounces={false}>
            {typeof body === 'string' || typeof body === 'number' ? <Text style={styles.bodyText}>{body}</Text> : body}
          </ScrollView>
          <View style={styles.footer}>
            <Button variant="outlined" label="Cancel" onPress={requestClose} disabled={busy} />
            <Button
              variant={destructive ? 'destructive' : 'primary'}
              label={confirmLabel}
              busy={busy}
              busyLabel={busyLabel}
              haptic="medium"
              onPress={onConfirm}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  scrim: { backgroundColor: colors.scrim },
  dialog: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '100%',
    padding: space.xl,
    borderRadius: radius.card,
    backgroundColor: colors.elevatedBg,
    ...elevation.floating,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: font.outfit.semiBold,
    fontSize: type.titleLarge.fontSize,
    lineHeight: type.titleLarge.lineHeight,
    letterSpacing: type.titleLarge.letterSpacing,
  },
  body: { flexGrow: 0, flexShrink: 1, marginTop: space.sm },
  bodyText: {
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodyLarge.fontSize,
    lineHeight: type.bodyLarge.lineHeight,
  },
  footer: {
    marginTop: space.xl,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: space.sm,
  },
});
