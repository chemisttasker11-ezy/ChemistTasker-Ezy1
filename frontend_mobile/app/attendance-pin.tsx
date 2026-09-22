import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, HelperText, RadioButton, Text, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { chemistTaskerApi } from '@/config/api';

type Pharmacy = { id: number; name: string; has_pin: boolean };
export default function AttendancePinScreen() {
  const router = useRouter();
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [selected, setSelected] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try {
      const data = await attendance.getPinPharmacies();
      setPharmacies(data.pharmacies);
      setSelected(data.pharmacies.length === 1 ? String(data.pharmacies[0].id) : '');
    } catch { setError('Unable to load your active pharmacy memberships.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const valid = !!selected && /^\d{4,6}$/.test(pin) && pin === confirm;
  const save = async () => {
    if (!valid) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await attendance.updatePin(Number(selected), pin);
      setSuccess(`Attendance PIN saved for ${pharmacies.find(p => String(p.id) === selected)?.name}. Connect the terminal to the internet the next time you use this PIN.`);
      setPin(''); setConfirm('');
    } catch (e: any) { setError(e?.payload?.error || e?.message || 'PIN was not saved. Try again.'); }
    finally { setSaving(false); }
  };
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Button icon="arrow-left" onPress={() => router.back()}>Back</Button>
    <Text variant="headlineMedium">Attendance PIN</Text>
    <Text>Choose your pharmacy, then set a 4 to 6 digit PIN for its attendance terminal. This is separate from your account password.</Text>
    {loading && <ActivityIndicator accessibilityLabel="Loading pharmacy memberships" />}
    {!!error && <><HelperText type="error" accessibilityLiveRegion="polite">{error}</HelperText><Button onPress={load}>Reload pharmacies</Button></>}
    {!loading && !error && !pharmacies.length && <Text>No active pharmacy memberships are available. Contact your pharmacy manager.</Text>}
    <RadioButton.Group value={selected} onValueChange={v => { setSelected(v); setPin(''); setConfirm(''); setSuccess(''); }}>
      {pharmacies.map(p => <RadioButton.Item key={p.id} label={p.name} value={String(p.id)} disabled={saving} />)}
    </RadioButton.Group>
    <TextInput label="New attendance PIN" mode="outlined" secureTextEntry keyboardType="number-pad" maxLength={6} value={pin} onChangeText={v => setPin(v.replace(/\D/g, ''))} disabled={saving} />
    <TextInput label="Confirm attendance PIN" mode="outlined" secureTextEntry keyboardType="number-pad" maxLength={6} value={confirm} onChangeText={v => setConfirm(v.replace(/\D/g, ''))} disabled={saving} />
    {!!confirm && pin !== confirm && <HelperText type="error">The PINs do not match.</HelperText>}
    <Button mode="contained" contentStyle={styles.button} loading={saving} disabled={!valid || saving} onPress={save}>Save attendance PIN</Button>
    {!!success && <Text accessibilityLiveRegion="polite" style={styles.success}>{success}</Text>}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#F5F8FC' }, content: { padding: 24, gap: 18 }, button: { minHeight: 52 }, success: { color: '#116647', lineHeight: 23 } });
