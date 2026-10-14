// "Report" on a public talent post or job board shift (Expo). Reports go to that board's moderators.
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, Dialog, HelperText, Portal, RadioButton, Text, TextInput } from 'react-native-paper';
import { BOARD_REPORT_REASONS, reportBoardItem } from '@chemisttasker/shared-core';

export function ReportButton({ kind, id }: { kind: 'talent' | 'jobs'; id: number }) {
  const thing = kind === 'talent' ? 'profile' : 'shift';
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await reportBoardItem(kind, id, [reason, details.trim()].filter(Boolean).join(': '));
      setSent(true);
      setOpen(false);
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      setError(status === 401 || status === 403 ? `Sign in to report a ${thing}.` : "We couldn't send your report. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) return <Text style={styles.sent} accessibilityLiveRegion="polite">Reported. Thank you.</Text>;
  return (
    <>
      <Button mode="text" icon="flag-outline" compact onPress={() => setOpen(true)} accessibilityLabel={`Report this ${thing}`} textColor="#445474">
        Report
      </Button>
      <Portal>
        <Dialog visible={open} onDismiss={() => !busy && setOpen(false)}>
          <Dialog.Title>Report this {thing}</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.help}>Our moderators review every report. The person who posted it is not told who reported it.</Text>
            <RadioButton.Group value={reason} onValueChange={setReason}>
              {BOARD_REPORT_REASONS.map(option => <RadioButton.Item key={option} value={option} label={option} position="leading" labelStyle={styles.option} />)}
            </RadioButton.Group>
            <TextInput mode="outlined" label="Anything else? (optional)" value={details} onChangeText={setDetails} multiline maxLength={400} />
            {error ? <HelperText type="error" visible>{error}</HelperText> : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button mode="contained" onPress={submit} loading={busy} disabled={busy || !reason}>Send report</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  help: { fontSize: 13.5, lineHeight: 20, color: '#445474', marginBottom: 8 },
  option: { fontSize: 14, textAlign: 'left' },
  sent: { fontSize: 12.5, color: '#445474', paddingHorizontal: 8, paddingVertical: 10 },
});
