import React, { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { useAuth } from '@/context/AuthContext';
import { parseChemistTaskerShareCode, safeShareCodeLabel, type ShareCode } from '@/features/share/shareCode';
import { saveContact } from '@/features/share/savedContacts';
import { colors, radius, space } from '@/constants/tokens';

export default function ShareCodeScanner() {
  const router = useRouter();
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [manual, setManual] = useState('');
  const [code, setCode] = useState<ShareCode | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const inspect = (raw: string) => {
    setScanning(false); setProcessing(false); setNotice('');
    const parsed = parseChemistTaskerShareCode(raw);
    if (!parsed) { setError('This is not a supported ChemistTasker contact QR link. No action was taken.'); setCode(null); return; }
    setError(''); setCode(parsed);
  };
  const start = async () => {
    setError(''); setCode(null);
    try {
      const granted = permission?.granted ? permission : await requestPermission();
      if (!granted?.granted) {
        setError('Camera permission denied. You can paste a link instead or enable Camera in device Settings.');
        return;
      }
      setScanning(true);
    } catch { setError('Could not start camera. Paste a link or change camera permission in device Settings.'); }
  };
  const scanned = ({ data }: BarcodeScanningResult) => {
    if (processing) return;
    setProcessing(true); inspect(data);
  };
  const save = async () => {
    if (user?.id == null || !code) return;
    try { await saveContact(user.id, code); setNotice('Saved privately on this device for this account. This does not send an application or add a staff member.'); }
    catch { setError('Could not save this contact. Try again.'); }
  };
  const open = async () => {
    if (!code) return;
    if (code.kind === 'pharmacy-invitation') {
      router.push({ pathname: '/membership/apply/[token]', params: { token: code.token } } as any);
      return;
    }
    try { await Linking.openURL(code.url); }
    catch { setError('This contact could not be opened. You can save it for later.'); }
  };

  return <SafeAreaView style={styles.page} edges={['top','left','right','bottom']}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Button icon="arrow-left" onPress={() => router.back()}>Back</Button>
      <Text variant="headlineMedium" style={styles.title}>Scan a ChemistTasker code</Text>
      <Text style={styles.muted}>Scan a worker&apos;s public listing, a pharmacy membership invitation or an organisation profile. You will review the result before opening or saving it.</Text>
      {scanning ? <View style={styles.scanner}>
        <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={processing ? undefined : scanned} />
        <Button mode="contained" onPress={() => setScanning(false)} style={styles.close}>Close camera</Button>
      </View> : <Button mode="contained" onPress={() => void start()}>Scan QR with camera</Button>}
      <TextInput mode="outlined" autoCapitalize="none" label="Or paste a ChemistTasker link" value={manual} onChangeText={setManual} multiline />
      <Button mode="outlined" disabled={!manual.trim()} onPress={() => inspect(manual)}>Review link</Button>
      {code ? <Card mode="outlined" style={styles.card}><Card.Content style={styles.contentInner}>
        <Text variant="titleMedium">{safeShareCodeLabel(code)}</Text>
        <Text selectable style={styles.muted}>{code.url}</Text>
        <Text style={styles.muted}>A QR is not proof of employment or verification. Pharmacy admission, favourite status and invitations require existing server approval.</Text>
        <Button mode="contained" onPress={() => void open()}>{code.kind === 'pharmacy-invitation' ? 'Review membership application' : 'View public details'}</Button>
        <Button mode="outlined" onPress={() => void save()}>Save privately for later</Button>
      </Card.Content></Card> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text accessibilityRole="alert" style={styles.muted}>{notice}</Text> : null}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space['3xl'] },
  contentInner: { gap: space.md },
  title: { color: colors.textPrimary, fontWeight: '700' },
  muted: { color: colors.textSecondary, lineHeight: 22 },
  card: { backgroundColor: colors.surfaceBg, borderColor: colors.border, borderRadius: radius.card },
  scanner: { width: '100%', aspectRatio: 1, overflow: 'hidden', borderRadius: radius.card },
  close: { position: 'absolute', bottom: space.md, alignSelf: 'center' },
  error: { color: colors.status.red.fg },
});
