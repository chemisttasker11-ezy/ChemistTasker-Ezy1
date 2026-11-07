import React, { useCallback, useState } from 'react';
import { Modal, type ModalProps, Platform, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useAuth } from '@/context/AuthContext';
import { useAppLockState, getAppLockActions } from '@/utils/appLock';
import { DatePickerModal, TimePickerModal, DatePickerInput } from 'react-native-paper-dates';
import { colors, space } from '@/constants/tokens';
import { BrandLoader } from '@/components/ui/BrandLoader';

export type GuardedModalProps = ModalProps;

/**
 * Centrally guarded Modal primitive.
 * Keeps already-visible native Modal mounted across lock cycles so React children
 * and native subtrees are NOT unmounted, preserving drafts and form states.
 * While locked, suppresses interaction/visibility on the sensitive subtree and
 * presents the lock cover with recovery controls INSIDE the existing native modal window.
 */
export function GuardedModal({ visible = true, children, style, onRequestClose, ...rest }: GuardedModalProps) {
  const { user } = useAuth();
  const coordinator = useAppLockState();
  const [actionBusy, setActionBusy] = useState(false);
  const isLocked =
    Platform.OS !== 'web' &&
    (coordinator.isLocked || (user?.id != null && coordinator.activeUserId !== user.id));
  const isUnreadable = coordinator.status === 'unreadable';

  const handleRequestClose = useCallback<NonNullable<ModalProps['onRequestClose']>>((event) => {
    if (isLocked) {
      // Suppress back dismissal while locked to prevent clearing drafts under lock
      return;
    }
    onRequestClose?.(event);
  }, [isLocked, onRequestClose]);

  const runAction = async (type: 'unlock' | 'logout' | 'retry') => {
    const actions = getAppLockActions();
    if (!actions || actionBusy) return;
    setActionBusy(true);
    try {
      if (type === 'unlock') await actions.unlock();
      else if (type === 'logout') await actions.signInWithPassword();
      else if (type === 'retry') await actions.retryPolicy();
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <Modal visible={visible} onRequestClose={handleRequestClose} {...rest}>
      <View
        style={[styles.container, style, isLocked && styles.hiddenSubtree]}
        pointerEvents={isLocked ? 'none' : 'auto'}
        accessibilityElementsHidden={isLocked}
        importantForAccessibility={isLocked ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {isLocked ? (
        <View
          style={styles.lockOverlay}
          accessibilityViewIsModal
          importantForAccessibility="yes"
          accessibilityLabel="ChemistTasker app lock"
        >
          <Text variant="headlineMedium" style={styles.heading}>
            {isUnreadable ? 'Security verification required' : 'ChemistTasker is locked'}
          </Text>
          <Text style={styles.body}>
            {isUnreadable
              ? 'We could not verify your security settings on this device. Retry or sign in with your password to continue.'
              : 'Unlock using your device fingerprint, Face ID or system passcode. Your existing account session and permissions still apply.'}
          </Text>
          {coordinator.error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {coordinator.error}
            </Text>
          ) : null}
          {isUnreadable ? (
            <>
              <Button mode="contained" loading={actionBusy} disabled={actionBusy} onPress={() => void runAction('retry')}>
                Retry
              </Button>
              <Button mode="outlined" disabled={actionBusy} onPress={() => void runAction('logout')}>
                Sign in with password instead
              </Button>
            </>
          ) : coordinator.hidden ? (
            <BrandLoader size={56} accessibilityLabel="Securing your workspace…" />
          ) : (
            <>
              <Button mode="contained" loading={actionBusy} disabled={actionBusy} onPress={() => void runAction('unlock')}>
                Unlock app
              </Button>
              <Button mode="outlined" disabled={actionBusy} onPress={() => void runAction('logout')}>
                Sign in with password instead
              </Button>
            </>
          )}
        </View>
      ) : null}
    </Modal>
  );
}

/**
 * Ephemeral date/time picker dialogs are suppressed during lock,
 * while chosen controlled values in the host component remain preserved.
 */
export function GuardedDatePickerModal(props: React.ComponentProps<typeof DatePickerModal>) {
  const { user } = useAuth();
  const coordinator = useAppLockState();
  const isLocked =
    Platform.OS !== 'web' &&
    (coordinator.isLocked || (user?.id != null && coordinator.activeUserId !== user.id));
  return <DatePickerModal {...props} visible={Boolean(props.visible && !isLocked)} />;
}

export function GuardedTimePickerModal(props: React.ComponentProps<typeof TimePickerModal>) {
  const { user } = useAuth();
  const coordinator = useAppLockState();
  const isLocked =
    Platform.OS !== 'web' &&
    (coordinator.isLocked || (user?.id != null && coordinator.activeUserId !== user.id));
  return <TimePickerModal {...props} visible={Boolean(props.visible && !isLocked)} />;
}

/**
 * Suppresses internal native modal while locked by setting withModal=false,
 * closing an open modal while retaining the host input's controlled value.
 */
export function GuardedDatePickerInput(props: React.ComponentProps<typeof DatePickerInput>) {
  const { user } = useAuth();
  const coordinator = useAppLockState();
  const isLocked =
    Platform.OS !== 'web' &&
    (coordinator.isLocked || (user?.id != null && coordinator.activeUserId !== user.id));
  const originalWithModal = props.withModal !== false;

  return (
    <DatePickerInput
      {...props}
      disabled={props.disabled || isLocked}
      withModal={isLocked ? false : originalWithModal}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hiddenSubtree: { opacity: 0 },
  lockOverlay: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    zIndex: 99999,
    elevation: 99999,
    backgroundColor: colors.pageBg,
    justifyContent: 'center',
    padding: space['3xl'],
    gap: space.lg,
  },
  heading: { color: colors.textPrimary, fontWeight: '700' },
  body: { color: colors.textSecondary, lineHeight: 23 },
  error: { color: colors.status.red.fg },
});

export default GuardedModal;
