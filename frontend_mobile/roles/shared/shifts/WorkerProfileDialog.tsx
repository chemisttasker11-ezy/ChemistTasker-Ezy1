// The booked worker's profile in Shift Centre Confirmed and History (same as web WorkerProfileDialog). Contact details,
// the CV and Message come only with Confirmed (owner decision 2026-10-14); the backend leaves contact out of History.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, Portal, Text } from 'react-native-paper';
import { FileText, Mail, MessageSquare, Phone } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import type { ShiftUser, ShiftWorkProfile } from '@chemisttasker/shared-core';
import { colors, radius, space } from '@/constants/tokens';
import { useAuth } from '@/context/AuthContext';
import { getMessageDetailRoute } from '@/utils/chatRoutes';
import { startDirectChat } from '../chat/hooks';
import { CandidateWorkProfile } from '../skills/CandidateWorkProfile';
import { type ShiftPersona } from './shiftSurface';
import { useShiftSurface } from './useShiftSurface';

export function resolveAssignedProfileRoute(
  role: string | null | undefined,
  roomId: number | string,
  persona?: ShiftPersona | null,
): string {
  return getMessageDetailRoute(role, roomId, persona);
}

export function WorkerProfileDialog({
  visible,
  loading,
  profile,
  onDismiss,
  canMessage = false,
  persona,
}: {
  visible: boolean;
  loading: boolean;
  profile: ShiftUser | null;
  onDismiss: () => void;
  canMessage?: boolean;
  persona?: ShiftPersona | null;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const surface = useShiftSurface();
  const activePersona = persona ?? surface.persona;
  const [opening, setOpening] = useState(false);
  const p = profile as (ShiftUser & Partial<ShiftWorkProfile>) | null;
  const name = [p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'Booked worker';

  const chatGenRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      chatGenRef.current++;
    };
  }, [surface.scopeKey, p?.id]);

  const handleDismiss = useCallback(() => {
    chatGenRef.current++;
    setOpening(false);
    onDismiss();
  }, [onDismiss]);

  const message = async () => {
    if (p?.id == null) return;
    const gen = ++chatGenRef.current;
    const scopeSnapshot = surface.scopeKey;
    const profileIdSnapshot = p.id;
    setOpening(true);
    try {
      const room: any = await startDirectChat({ userId: p.id });
      if (!mountedRef.current || gen !== chatGenRef.current || surface.scopeKey !== scopeSnapshot || p.id !== profileIdSnapshot) {
        return;
      }
      const roomId = room?.id ?? room?.room_id;
      handleDismiss();
      if (roomId) {
        const detailRoute = resolveAssignedProfileRoute(user?.role, roomId, activePersona);
        router.push({ pathname: detailRoute as any, params: { id: String(roomId), name } });
      }
    } catch {
      // Do not navigate on chat initiation failure
    } finally {
      if (mountedRef.current && gen === chatGenRef.current) {
        setOpening(false);
      }
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleDismiss} style={styles.dialog}>
        <Dialog.Title>Worker profile</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.content}>
            {loading ? <ActivityIndicator style={{ marginVertical: space.xl }} accessibilityLabel="Loading profile" color={colors.primary} /> : p ? (
              <>
                <CandidateWorkProfile name={name} bio={p.shortBio} profile={p as unknown as ShiftWorkProfile} />
                {p.email || p.phoneNumber || p.resume ? (
                  <View style={styles.contact}>
                    <Text style={styles.title}>Contact for this booking</Text>
                    {p.email ? (
                      <Button
                        mode="text"
                        icon={({ size, color }) => <Mail size={size} color={color} />}
                        compact
                        style={styles.link}
                        onPress={() => void Linking.openURL(`mailto:${p.email}`)}
                      >
                        {p.email}
                      </Button>
                    ) : null}
                    {p.phoneNumber ? (
                      <Button
                        mode="text"
                        icon={({ size, color }) => <Phone size={size} color={color} />}
                        compact
                        style={styles.link}
                        onPress={() => void Linking.openURL(`tel:${p.phoneNumber}`)}
                      >
                        {p.phoneNumber}
                      </Button>
                    ) : null}
                    {p.resume ? (
                      <Button
                        mode="outlined"
                        icon={({ size, color }) => <FileText size={size} color={color} />}
                        compact
                        style={styles.link}
                        onPress={() => void Linking.openURL(p.resume!)}
                      >
                        Open CV
                      </Button>
                    ) : null}
                  </View>
                ) : null}
              </>
            ) : <Text>This profile could not be loaded.</Text>}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={handleDismiss} style={styles.actionBtn}>Close</Button>
          {canMessage && p?.id != null && !loading ? (
            <Button
              mode="contained"
              icon={({ size, color }) => <MessageSquare size={size} color={color} />}
              loading={opening}
              disabled={opening}
              onPress={() => void message()}
              style={styles.actionBtn}
            >
              Message now
            </Button>
          ) : null}
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { maxHeight: '88%', borderRadius: radius.card },
  content: { paddingVertical: space.sm + 4, gap: space.sm + 4 },
  contact: { gap: space.xs, paddingTop: space.sm + 4, borderTopWidth: 1, borderTopColor: colors.border },
  title: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  actionBtn: { minHeight: 44, justifyContent: 'center' },
});
