import React, { useCallback, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Text } from 'react-native-paper';
import { useAuth } from '@/context/AuthContext';
import { listSavedContacts, removeContact, type SavedContact } from '@/features/share/savedContacts';
import { safeShareCodeLabel } from '@/features/share/shareCode';
import { colors, radius, space } from '@/constants/tokens';

export default function SavedQrContacts() {
  const router = useRouter();
  const { user } = useAuth();
  const [contacts, setContacts] = useState<SavedContact[]>([]);
  const [error, setError] = useState('');
  const id = user?.id;
  const reload = useCallback(async () => {
    if (id == null) { setContacts([]); return; }
    try { setContacts(await listSavedContacts(id)); setError(''); }
    catch { setError('Could not read saved contacts.'); }
  }, [id]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const open = async (contact: SavedContact) => {
    if (contact.kind === 'pharmacy-invitation') {
      router.push({ pathname: '/membership/apply/[token]', params: { token: contact.token } } as any);
      return;
    }
    try { await Linking.openURL(contact.url); } catch { setError('Could not open this contact.'); }
  };
  const remove = async (url: string) => {
    if (id == null) return;
    try { setContacts(await removeContact(id, url)); }
    catch { setError('Could not remove this saved contact.'); }
  };
  return <SafeAreaView style={styles.page} edges={['top','left','right','bottom']}>
    <ScrollView contentContainerStyle={styles.content}>
      <Button icon="arrow-left" onPress={() => router.back()}>Back</Button>
      <Text variant="headlineMedium" style={styles.title}>Saved QR contacts</Text>
      <Text style={styles.muted}>Saved only on this device and scoped to this account. No membership or favourite status is created by saving.</Text>
      {contacts.length ? contacts.map(contact => <Card key={contact.url} mode="outlined" style={styles.card}><Card.Content style={styles.group}>
        <Text variant="titleMedium">{safeShareCodeLabel(contact)}</Text>
        <Text selectable style={styles.muted}>{contact.url}</Text>
        <Text style={styles.muted}>{contact.kind==='pharmacy-invitation'?'Private invitation · this device only':contact.synced?'Synced to your account':'Local draft · not synced'}</Text>
        <View style={styles.actions}>
          <Button mode="contained" onPress={() => void open(contact)}>Open</Button>
          <Button mode="outlined" onPress={() => void remove(contact.url)}>Remove</Button>
        </View>
      </Card.Content></Card>) : <Text style={styles.muted}>No saved QR contacts yet.</Text>}
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
