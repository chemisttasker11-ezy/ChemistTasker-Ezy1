// The booked worker's profile in Shift Centre Confirmed and History (same as web WorkerProfileDialog). Contact details,
// the CV and Message come only with Confirmed (owner decision 2026-10-14); the backend leaves contact out of History.
import React, { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, Portal, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import type { ShiftUser, ShiftWorkProfile } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import { getMessageDetailRoute } from '@/utils/chatRoutes';
import { startDirectChat } from '../chat/hooks';
import { CandidateWorkProfile } from '../skills/CandidateWorkProfile';

export function WorkerProfileDialog({ visible, loading, profile, onDismiss, canMessage = false }: {
  visible: boolean;
  loading: boolean;
  profile: ShiftUser | null;
  onDismiss: () => void;
  canMessage?: boolean;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [opening, setOpening] = useState(false);
  const p = profile as (ShiftUser & Partial<ShiftWorkProfile>) | null;
  const name = [p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'Booked worker';

  const message = async () => {
    if (p?.id == null) return;
    setOpening(true);
    try {
      const room: any = await startDirectChat({ userId: p.id });
      const roomId = room?.id ?? room?.room_id;
      onDismiss();
      if (roomId) router.push({ pathname: getMessageDetailRoute(user?.role, roomId) as any, params: { id: String(roomId), name } });
    } finally {
      setOpening(false);
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>Worker profile</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.content}>
            {loading ? <ActivityIndicator style={{ marginVertical: 24 }} accessibilityLabel="Loading profile" /> : p ? (
              <>
                <CandidateWorkProfile name={name} bio={p.shortBio} profile={p as unknown as ShiftWorkProfile} />
                {p.email || p.phoneNumber || p.resume ? (
                  <View style={styles.contact}>
                    <Text style={styles.title}>Contact for this booking</Text>
                    {p.email ? <Button mode="text" icon="email-outline" compact style={styles.link} onPress={() => void Linking.openURL(`mailto:${p.email}`)}>{p.email}</Button> : null}
                    {p.phoneNumber ? <Button mode="text" icon="phone-outline" compact style={styles.link} onPress={() => void Linking.openURL(`tel:${p.phoneNumber}`)}>{p.phoneNumber}</Button> : null}
                    {p.resume ? <Button mode="outlined" icon="file-document-outline" compact style={styles.link} onPress={() => void Linking.openURL(p.resume!)}>Open CV</Button> : null}
                  </View>
                ) : null}
              </>
            ) : <Text>This profile could not be loaded.</Text>}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Close</Button>
          {canMessage && p?.id != null && !loading ? (
            <Button mode="contained" icon="message-outline" loading={opening} disabled={opening} onPress={() => void message()}>Message now</Button>
          ) : null}
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { maxHeight: '88%' },
  content: { paddingVertical: 12, gap: 12 },
  contact: { gap: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#DCE3EE' },
  title: { fontSize: 13, fontWeight: '800', color: '#06214A' },
  link: { alignSelf: 'flex-start' },
});
