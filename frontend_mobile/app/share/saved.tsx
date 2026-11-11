import React, { useCallback, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Text } from 'react-native-paper';
import { useAuth } from '@/context/AuthContext';
import { getSessionGeneration } from '@/utils/authSession';
import { listSavedContacts, removeContact, saveContact, type SavedContact } from '@/features/share/savedContacts';
import { safeShareCodeLabel } from '@/features/share/shareCode';
import { colors, radius, space } from '@/constants/tokens';

export default function SavedQrContacts() {
  const router = useRouter();
  const { user } = useAuth();
  const [contacts, setContacts] = useState<SavedContact[]>([]);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const generation = useRef(0);
  const id = user?.id;
  const reload = useCallback(async () => {
    const ticket = ++generation.current;
    setContacts([]);
    if (id == null) return;
    try {
      const rows = await listSavedContacts(id);
      if (ticket === generation.current) { setContacts(rows); setError(''); }
    } catch {
      if (ticket === generation.current) setError('Could not read saved contacts.');
    }
  }, [id]);
  useFocusEffect(useCallback(() => {
    void reload();
    return () => { generation.current++; };
  }, [reload]));
  const open = async (contact: SavedContact) => {
    if (contact.kind === 'pharmacy-invitation') {
      router.push({ pathname: '/membership/apply/[token]', params: { token: contact.token } } as any);
      return;
    }
    try { await Linking.openURL(contact.url); } catch { setError('Could not open this contact.'); }
  };
  const remove = async (url: string) => {
    if (id == null) return;
    const ticket = ++generation.current;
    try {
      const rows = await removeContact(id, url);
      if (ticket === generation.current) setContacts(rows);
    } catch { if (ticket === generation.current) setError('Could not remove this saved contact.'); }
  };
  const syncDrafts = async () => {
    if (id == null || syncing) return;
    const ticket=++generation.current;
    const sessionGeneration=getSessionGeneration();
    setSyncing(true); setError('');
    try {
      for (const contact of contacts) {
        if (sessionGeneration !== getSessionGeneration()) return;
        if (contact.kind === 'pharmacy-invitation' || contact.synced) continue;
        await saveContact(id, contact);
        if (ticket !== generation.current || sessionGeneration !== getSessionGeneration()) return;
      }
      const rows=await listSavedContacts(id);
      if (ticket === generation.current) {
        setContacts(rows);
        if (rows.some(row=>row.kind!=='pharmacy-invitation'&&!row.synced)) setError('Some saved contacts remain local. Check your connection and retry.');
      }
    } catch {
      if (ticket===generation.current) setError('Some contacts could not sync. Your local drafts remain available.');
    } finally {
      if (ticket===generation.current) setSyncing(false);
    }
  };
  return <SafeAreaView style={styles.page} edges={['top','left','right','bottom']}>
    <ScrollView contentContainerStyle={styles.content}>
      <Button icon="arrow-left" onPress={() => router.back()}>Back</Button>
      <Text variant="headlineMedium" style={styles.title}>Saved QR contacts</Text>
      <Text style={styles.muted}>Public worker and organisation contacts sync to your account when online. Pharmacy invitation codes stay securely on this device. Saving never creates staff or favourite status.</Text>
      {contacts.length ? contacts.map(contact => <Card key={contact.url} mode="outlined" style={styles.card}><Card.Content style={styles.group}>
        <Text variant="titleMedium">{safeShareCodeLabel(contact)}</Text>
        <Text selectable style={styles.muted}>{contact.url}</Text>
        <Text style={styles.muted}>{contact.kind==='pharmacy-invitation'?'Private invitation · this device only':contact.synced?'Synced to your account':'Local draft · not synced'}</Text>
        <View style={styles.actions}>
          <Button mode="contained" onPress={() => void open(contact)}>Open</Button>
          <Button mode="outlined" onPress={() => void remove(contact.url)}>Remove</Button>
        </View>
      </Card.Content></Card>) : <Text style={styles.muted}>No saved QR contacts yet.</Text>}
      {contacts.some(contact => contact.kind !== 'pharmacy-invitation' && !contact.synced) ?
        <Button mode="contained" onPress={() => void syncDrafts()} disabled={syncing} loading={syncing}>Sync local drafts to my account</Button> : null}
      <Button mode="outlined" onPress={() => router.push('/share/scan' as any)}>Scan another code</Button>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space['3xl'] },
  card: { backgroundColor: colors.surfaceBg, borderColor: colors.border, borderRadius: radius.card },
  group: { gap: space.sm },
  title: { color: colors.textPrimary, fontWeight: '700' },
  muted: { color: colors.textSecondary, lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  error: { color: colors.status.red.fg },
});
