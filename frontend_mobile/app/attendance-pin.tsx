import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, HelperText, RadioButton, Text, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { attendance } from '@chemisttasker/shared-core';

type Pharmacy = { id: number; name: string; has_pin: boolean };
export default function AttendancePinScreen() {
  const router = useRouter();
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [selected, setSelected] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState('');
  const load = async () => {
    setLoading(true); setLoadError(''); setSaveError('');
    try {
      const data = await attendance.getPinPharmacies();
      setPharmacies(data.pharmacies);
      setSelected(data.pharmacies.length === 1 ? String(data.pharmacies[0].id) : '');
    } catch { setLoadError('Unable to load your active pharmacy memberships.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const valid = !!selected && /^\d{4,6}$/.test(pin) && pin === confirm;
  const save = async () => {
    if (!valid) return;
    setSaving(true); setSaveError(''); setSuccess('');
    try {
      await attendance.updatePin(Number(selected), pin);
      setSuccess(`Attendance PIN saved for ${pharmacies.find(p => String(p.id) === selected)?.name}. Connect the terminal to the internet the next time you use this PIN.`);
      setPin(''); setConfirm('');
    } catch (e: any) { setSaveError(e?.payload?.error || e?.message || 'PIN was not saved. Try again.'); }
    finally { setSaving(false); }
  };
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Button icon="arrow-left" onPress={() => router.back()}>Back</Button>
    <Text variant="headlineMedium">Attendance PIN</Text>
    <Text>Choose your pharmacy, then set a 4 to 6 digit PIN for its attendance terminal. This is separate from your account password.</Text>
    {loading && <ActivityIndicator accessibilityLabel="Loading pharmacy memberships" />}
    {!!loadError && <><HelperText type="error" accessibilityLiveRegion="polite">{loadError}</HelperText><Button onPress={load}>Reload pharmacies</Button></>}
    {!loading && !loadError && !pharmacies.length && (
      <>
        <Text style={styles.guidanceText}>
          Setting a kiosk PIN requires an accepted staff membership at that pharmacy.
        </Text>
        <Text style={styles.guidanceText}>
          Booked locums clock in using the mobile app by scanning the pharmacy QR code on the counter terminal.
        </Text>
        <Button
          mode="contained"
          contentStyle={styles.button}
          onPress={() => router.push('/attendance/clock')}
        >
          Scan pharmacy QR to clock in
        </Button>
        <Button
          mode="outlined"
          contentStyle={styles.button}
          onPress={() => router.push('/admin-invitations')}
        >
          View pending invitations
        </Button>
      </>
    )}
    {!loading && !loadError && pharmacies.length > 0 && (
      <>
        <RadioButton.Group value={selected} onValueChange={v => { setSelected(v); setPin(''); setConfirm(''); setSaveError(''); setSuccess(''); }}>
          {pharmacies.map(p => <RadioButton.Item key={p.id} label={p.name} value={String(p.id)} disabled={saving} />)}
        </RadioButton.Group>
        <TextInput label="New attendance PIN" mode="outlined" secureTextEntry keyboardType="number-pad" maxLength={6} value={pin} onChangeText={v => setPin(v.replace(/\D/g, ''))} disabled={saving} />
        <TextInput label="Confirm attendance PIN" mode="outlined" secureTextEntry keyboardType="number-pad" maxLength={6} value={confirm} onChangeText={v => setConfirm(v.replace(/\D/g, ''))} disabled={saving} />
        {!!confirm && pin !== confirm && <HelperText type="error">The PINs do not match.</HelperText>}
        {!!saveError && <HelperText type="error" accessibilityLiveRegion="polite">{saveError}</HelperText>}
        <Button mode="contained" contentStyle={styles.button} loading={saving} disabled={!valid || saving} onPress={save}>Save attendance PIN</Button>
      </>
    )}
    {!!success && <Text accessibilityLiveRegion="polite" style={styles.success}>{success}</Text>}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#F5F8FC' }, content: { padding: 24, gap: 18 }, button: { minHeight: 52 }, success: { color: '#116647', lineHeight: 23 }, guidanceText: { color: '#334155', lineHeight: 22, fontSize: 15 } });
