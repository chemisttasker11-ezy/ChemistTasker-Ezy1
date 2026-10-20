import { ahpraStatusMessage } from '@chemisttasker/shared-core';
import React from 'react';
import { router } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Button, HelperText, Text } from 'react-native-paper';
import { useAhpra } from '../context/AhpraContext';

export interface AhpraStatusProps {
  submitLabel?: string;
}

export default function AhpraStatus({ submitLabel }: AhpraStatusProps = {}) {
  const { summary, error, busy, seconds, recheck } = useAhpra();
  if (!summary) return null;
  const message = ahpraStatusMessage(summary);
  const label = (summary.state !== 'review' && summary.state !== 'rejected' && summary.state !== 'type_not_accepted' && summary.registration_status) || ({ review: 'Verification requires review', ok: 'Verified', pending: 'Check pending', suspended: summary.frozen ? 'Account paused' : 'Registration suspended', not_found: 'Not found', unreadable: 'Not verified', rejected: 'Rejected', type_not_accepted: 'Registration type not accepted' } as const)[summary.state];
  const attemptsExhausted = summary.state === 'unreadable' && summary.attempts >= 3;
  const isBlocked = summary.state === 'suspended' || summary.state === 'not_found' || summary.state === 'rejected' || summary.state === 'type_not_accepted';

  let hint = '';
  if (summary.state === 'not_found') {
    hint = submitLabel
      ? `Fix the number above, press "${submitLabel}", then Re-check.`
      : 'Fix the number above, submit it, then Re-check.';
  } else if (summary.state === 'suspended') {
    // The number is locked while suspended.
    hint = 'Contact AHPRA to resolve your status, then press Re-check.';
  }

  return (
    <View
      style={[
        styles.container,
        isBlocked ? styles.blockedContainer : styles.infoContainer,
      ]}
      accessibilityLiveRegion="polite"
    >
      <Text variant="titleSmall" style={[styles.title, isBlocked ? styles.blockedTitle : styles.infoTitle]}>
        AHPRA: {label}
      </Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {summary.state === 'unreadable' && summary.contact_support ? <Text style={styles.message}>Still not working?</Text> : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <HelperText type="error">{error}</HelperText> : null}

      <View style={styles.actionRow}>
        {seconds > 0 ? (
          <View style={styles.cooldownBadge}>
            <Text style={styles.cooldownText}>
              Re-check in {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            </Text>
          </View>
        ) : (
          <Button
            mode={isBlocked ? 'contained' : 'outlined'}
            loading={busy}
            disabled={busy || attemptsExhausted}
            onPress={() => void recheck()}
            style={styles.button}
            contentStyle={styles.buttonContent}
          >
            {busy ? 'Queuing check...' : 'Re-check'}
          </Button>
        )}
        {summary.state === 'review' || summary.state === 'type_not_accepted' || (summary.state === 'unreadable' && summary.contact_support) ? (
          <Button onPress={() => router.push('/contact')} contentStyle={styles.buttonContent}>{summary.state === 'review' || summary.state === 'type_not_accepted' ? 'Contact us' : 'Contact us now'}</Button>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 10,
    gap: 8,
  },
  blockedContainer: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  infoContainer: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  title: {
    fontWeight: '700',
  },
  blockedTitle: {
    color: '#991B1B',
  },
  infoTitle: {
    color: '#075985',
  },
  message: {
    color: '#1F2937',
    fontSize: 14,
    lineHeight: 20,
  },
  hint: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  actionRow: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  cooldownBadge: {
    minHeight: 44,
    backgroundColor: 'rgba(51, 65, 85, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.25)',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  cooldownText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 14,
  },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 6,
  },
  buttonContent: {
    height: 44,
  },
});
