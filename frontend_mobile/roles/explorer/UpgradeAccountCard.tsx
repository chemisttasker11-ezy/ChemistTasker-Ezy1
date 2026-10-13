// New to pharmacy -> Pharmacist or Pharmacy team, once. Details, ID check, references and the talent post carry over;
// the new role's checks apply (AHPRA for pharmacists, the Australian mobile for everyone).
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, Card, Dialog, HelperText, Portal, RadioButton, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { chooseAccountType } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';

const CHOICES = [
  { staffRole: 'PHARMACIST', label: 'Pharmacist', body: 'You hold general AHPRA registration.' },
  { staffRole: 'INTERN', label: 'Intern pharmacist', body: 'You hold provisional AHPRA registration.' },
  { staffRole: 'TECHNICIAN', label: 'Dispensary technician', body: 'You work in the dispensary.' },
  { staffRole: 'ASSISTANT', label: 'Pharmacy assistant', body: 'You work in a pharmacy.' },
  { staffRole: 'STUDENT', label: 'Pharmacy student', body: 'You study pharmacy at university.' },
];

export function UpgradeAccountCard() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = CHOICES.find(item => item.staffRole === choice);

  const upgrade = async () => {
    if (!selected) return;
    const role = selected.staffRole === 'PHARMACIST' ? 'PHARMACIST' : 'OTHER_STAFF';
    setBusy(true);
    setError('');
    try {
      await chooseAccountType(role, { staff_role: selected.staffRole });
      await refreshUser();
      setOpen(false);
      // The profile screen lists what the new role still needs to be verified.
      router.replace((role === 'PHARMACIST' ? '/pharmacist/profile' : '/otherstaff/profile') as any);
    } catch (err: any) {
      setError(err?.message || "We couldn't upgrade your account. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.card}>
      <Card.Content style={{ gap: 8 }}>
        <Text variant="titleMedium" style={styles.title}>Ready for the next step?</Text>
        <Text style={styles.body}>
          Registered with AHPRA, studying pharmacy or working in a pharmacy now? Move to a Pharmacist or Pharmacy team account.
          Your details, photo ID check, references and talent post come with you; your new role's checks then apply. You can only do this once.
        </Text>
        <Button mode="outlined" onPress={() => setOpen(true)}>Upgrade my account</Button>
      </Card.Content>
      <Portal>
        <Dialog visible={open} onDismiss={() => !busy && setOpen(false)}>
          <Dialog.Title>Upgrade my account</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group value={choice} onValueChange={setChoice}>
              {CHOICES.map(item => (
                <RadioButton.Item key={item.staffRole} value={item.staffRole} label={`${item.label}\n${item.body}`} position="leading" labelStyle={styles.option} />
              ))}
            </RadioButton.Group>
            <Text style={styles.body}>This can't be undone.</Text>
            {error ? <HelperText type="error" visible>{error}</HelperText> : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button mode="contained" onPress={upgrade} loading={busy} disabled={busy || !selected}>
              {selected ? `Upgrade to ${selected.label.toLowerCase()}` : 'Upgrade'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16, borderRadius: 20, backgroundColor: '#FFFFFF' },
  title: { fontWeight: '600', color: '#06214A' },
  body: { fontSize: 13.5, lineHeight: 20, color: '#445474' },
  option: { fontSize: 14, textAlign: 'left' },
});
