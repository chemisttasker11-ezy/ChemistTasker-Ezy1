import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Button, Card, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PublicHubSummary } from '@chemisttasker/shared-core';
import { chemistTaskerApi } from '@/config/api';
import { colors, radius, space, touch } from '@/constants/tokens';

export default function PublicHubIndex() {
  const router = useRouter();
  const requestRef = useRef(0);
  const [hubs, setHubs] = useState<PublicHubSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setError(''); setLoading(true); setHubs([]);
    try {
      const result = await chemistTaskerApi.publicContent.listHubs();
      if (request === requestRef.current) setHubs(result);
    } catch (failure: any) {
      if (request === requestRef.current) setError(failure?.message || 'Public hubs could not load.');
    } finally { if (request === requestRef.current) setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    // Defer initial load until after effects subscribe; stale generations cannot overwrite state.
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; requestRef.current += 1; };
  }, [load]);
  return <SafeAreaView style={styles.page} edges={['top', 'left', 'right', 'bottom']}>
    <ScrollView contentContainerStyle={styles.content}>
      <Button icon="arrow-left" mode="text" onPress={() => router.canGoBack() ? router.back() : router.replace('/explore' as any)}>Explore</Button>
      <Text variant="headlineMedium" style={styles.title}>Public community</Text>
      <Text style={styles.muted}>Read pharmacy conversations and announcements. Participation depends on membership permissions.</Text>
      {loading ? <ActivityIndicator /> : error ?
        <><Text style={styles.error} accessibilityRole="alert">{error}</Text><Button mode="outlined" onPress={() => void load()}>Retry</Button></> :
        hubs.length ? hubs.map(hub => <Card key={hub.key} mode="outlined" style={styles.card}
          onPress={() => router.push({ pathname: '/explore/hubs/[hub]', params: { hub: hub.key } } as any)}>
          <Card.Content style={styles.cardBody}>
            <Text variant="titleMedium" style={styles.title}>{hub.label}</Text>
            <Text style={styles.muted}>{hub.can_interact ? 'You can take part in this community' : 'Read public discussions'}</Text>
          </Card.Content>
        </Card>) : <Text>No public communities are available yet.</Text>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, paddingBottom: space['3xl'], gap: space.md },
  card: { borderColor: colors.border, borderRadius: radius.card, backgroundColor: colors.surfaceBg },
  cardBody: { minHeight: touch.min, gap: space.sm },
  title: { color: colors.textPrimary, fontWeight: '700' },
  muted: { color: colors.textSecondary, lineHeight: 22 },
  error: { color: colors.status.red.fg },
});
