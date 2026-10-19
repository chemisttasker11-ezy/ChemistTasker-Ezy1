import { ahpraStatusMessage } from '@chemisttasker/shared-core';
import React from 'react';
import { View } from 'react-native';
import { Button, HelperText, Text } from 'react-native-paper';
import { useAhpra } from '../context/AhpraContext';

export default function AhpraStatus() {
  const { summary, error, busy, seconds, recheck } = useAhpra();
  if (!summary) return null;
  const message = ahpraStatusMessage(summary);
  const label = summary.registration_status || ({ ok: 'Verified', pending: 'Check pending', suspended: 'Account paused', not_found: 'Not found' } as const)[summary.state];
  return <View style={{ gap: 10, paddingVertical: 12 }} accessibilityLiveRegion="polite">
    <Text variant="titleSmall">AHPRA: {label}</Text>
    {message ? <Text>{message}</Text> : null}
    {error ? <HelperText type="error">{error}</HelperText> : null}
    <Button mode="outlined" loading={busy} disabled={busy || seconds > 0} onPress={() => void recheck()}>
      {busy ? 'Queuing check...' : seconds > 0 ? `Re-check in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Re-check'}
    </Button>
  </View>;
}
