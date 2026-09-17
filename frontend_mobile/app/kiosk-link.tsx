import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Card, RadioButton, Text, TextInput } from 'react-native-paper';
import apiClient from '@/utils/apiClient';

type Pharmacy = { id: number; name: string; timezone: string };
export default function KioskLinkPrompt() {
  const router = useRouter();
  const params = useLocalSearchParams<{ source?: string; pharmacy_id?: string; device_name?: string }>();
  const prompted = params.source === 'kiosk';
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [selected, setSelected] = useState('');
  const [deviceName, setDeviceName] = useState(params.device_name || 'Front counter');
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!prompted) { setLoading(false); return; }
    let active = true;
    setLoading(true); setError(null);
    apiClient.get('/client-profile/attendance/kiosk/pairing/request/').then(({ data }) => {
      if (!active) return;
      const rows: Pharmacy[] = data.pharmacies || [];
      setPharmacies(rows);
      const requested = rows.find(p => String(p.id) === params.pharmacy_id);
      if (params.pharmacy_id && !requested) {
        setError('You do not have terminal-management access to the pharmacy in this link.');
        setSelected('');
      } else setSelected(requested ? String(requested.id) : rows.length === 1 ? String(rows[0].id) : '');
    }).catch(() => { if (active) setError('Unable to load your pharmacies. Try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [prompted, params.pharmacy_id, refresh]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const pharmacy = pharmacies.find(p => String(p.id) === selected);
  const expired = !!code && now >= expiresAt;
  const createCode = async () => {
    if (!pharmacy || !deviceName.trim()) return;
    setSaving(true); setError(null);
    try {
      const { data } = await apiClient.post('/client-profile/attendance/kiosk/pairing/request/', {
        pharmacy_id: pharmacy.id, device_name: deviceName.trim(),
      });
      setCode(String(data.pairing_code)); setExpiresAt(Date.now() + data.expires_in_seconds * 1000);
    } catch (e: any) { setError(e.response?.data?.error || 'Unable to create a pairing code.'); }
    finally { setSaving(false); }
  };
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Button icon="arrow-left" onPress={() => router.back()}>Back</Button>
    <Text variant="headlineMedium" style={styles.heading}>Connect a terminal</Text>
    {!prompted ? <Text>Scan the setup QR on the desktop kiosk to start linking.</Text> : <>
      <Text style={styles.body}>Choose the pharmacy where this terminal will record attendance. Each terminal belongs to one pharmacy.</Text>
      {loading && <ActivityIndicator accessibilityLabel="Loading authorized pharmacies" />}
      {error && <View accessibilityLiveRegion="polite"><Text style={styles.error}>{error}</Text><Button onPress={() => setRefresh(v => v + 1)}>Retry</Button></View>}
      {!loading && pharmacies.length === 0 && !error && <Text>No pharmacies are available. Ask the owner to grant terminal-management access.</Text>}
      <RadioButton.Group value={selected} onValueChange={value => { setSelected(value); setCode(null); }}>
        {pharmacies.map(p => <Card key={p.id} style={[styles.pharmacy, selected === String(p.id) && styles.selected]}>
          <RadioButton.Item label={p.name} value={String(p.id)} disabled={saving} />
          <Text style={styles.zone}>{p.timezone}</Text>
        </Card>)}
      </RadioButton.Group>
      <TextInput mode="outlined" label="Terminal name" value={deviceName} onChangeText={setDeviceName} disabled={saving || !!code} maxLength={100} />
      {code && pharmacy ? <Card style={styles.receipt}><Card.Content>
        <Text variant="titleMedium">{pharmacy.name}</Text><Text>{deviceName}</Text>
        <Text style={styles.code}>{expired ? 'Expired' : code}</Text>
        <Text>{expired ? 'Create a new code to continue.' : 'Enter this code on the desktop. It can be used once and expires in 15 minutes.'}</Text>
      </Card.Content></Card> : null}
      <Button mode="contained" loading={saving} disabled={!pharmacy || !deviceName.trim() || loading || saving || (!!code && !expired)} onPress={createCode} contentStyle={styles.button}>
        {expired ? 'Create a new pairing code' : 'Confirm pharmacy and create code'}
      </Button>
    </>}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F8FC' }, content: { padding: 24, gap: 18 },
  heading: { color: '#06214A', fontWeight: '700' }, body: { color: '#46566C', lineHeight: 22 },
  pharmacy: { marginBottom: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D6DEEA' },
  selected: { borderColor: '#5222B8', borderWidth: 2 }, zone: { paddingHorizontal: 16, paddingBottom: 12, color: '#46566C' },
  receipt: { backgroundColor: '#FFFFFF' }, code: { fontSize: 36, letterSpacing: 6, color: '#06214A', paddingVertical: 20, fontWeight: '700' },
  error: { color: '#B42318' }, button: { minHeight: 52 },
});
