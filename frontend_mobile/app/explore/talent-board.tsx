import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Button, Card, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPublicTalentFeed } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import { colors, radius, space, touch } from '@/constants/tokens';

type Talent = {
  id: number;
  role_title?: string | null;
  role_category?: string | null;
  post_kind?: string | null;
  work_types?: string[] | null;
  location_state?: string | null;
  location_suburb?: string | null;
  availability_summary?: string | null;
  availability_mode?: string | null;
  reference_code?: string | null;
};
type TalentPage = Talent[] | { results?: Talent[]; next?: string | null; count?: number };

function nextPage(url: string | null | undefined): number | null {
  const found = /[?&]page=(\d+)(?:[&#]|$)/.exec(url || '');
  return found && Number(found[1]) > 1 ? Number(found[1]) : null;
}

export default function PublicTalentBoard() {
  const router = useRouter();
  const { user } = useAuth();
  const generation = useRef(0);
  const busyRef = useRef(false);
  const [rows, setRows] = useState<Talent[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');

  const load = useCallback(async () => {
    const request = ++generation.current;
    busyRef.current = false; setLoading(true); setMoreLoading(false); setError(''); setMoreError(''); setRows([]); setNext(null);
    try {
      const page = await getPublicTalentFeed({ page: 1, page_size: 24 }) as TalentPage;
      if (request !== generation.current) return;
      setRows(Array.isArray(page) ? page : page.results || []);
      setNext(Array.isArray(page) ? null : nextPage(page.next));
    } catch (failure: any) {
      if (request === generation.current) setError(failure?.message || 'Public talent could not load.');
    } finally { if (request === generation.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); return () => { generation.current += 1; }; }, [load]);

  const loadMore = async () => {
    if (next === null || busyRef.current) return;
    const request = generation.current;
    busyRef.current = true; setMoreLoading(true); setMoreError('');
    try {
      const page = await getPublicTalentFeed({ page: next, page_size: 24 }) as TalentPage;
      if (request !== generation.current) return;
      const incoming = Array.isArray(page) ? page : page.results || [];
      setRows(existing => {
        const merged = new Map(existing.map(row => [row.id, row]));
        for (const item of incoming) merged.set(item.id, item);
        return Array.from(merged.values());
      });
      setNext(Array.isArray(page) ? null : nextPage(page.next));
    } catch (failure: any) {
      if (request === generation.current) setMoreError(failure?.message || 'More talent could not load.');
    } finally { if (request === generation.current) { busyRef.current = false; setMoreLoading(false); } }
  };

  return <SafeAreaView style={styles.page} edges={['top','left','right','bottom']}>
    <ScrollView contentContainerStyle={styles.content}>
      <Button mode="text" icon="arrow-left" onPress={() => router.canGoBack() ? router.back() : router.replace('/explore' as any)}>Explore</Button>
      <Text variant="headlineMedium" style={styles.title}>Discover pharmacy talent</Text>
      <Text style={styles.muted}>Publicly shared skills and availability. Contact details are never shown here.</Text>
      {loading ? <ActivityIndicator /> : error ? <View style={styles.status}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Button onPress={() => void load()}>Retry</Button></View> :
        rows.length ? rows.map(item => <Card key={item.id} mode="outlined" style={styles.card}><Card.Content style={styles.cardBody}>
          <Text variant="titleMedium" style={styles.title}>{item.role_title || item.role_category || 'Pharmacy talent'}</Text>
          {item.location_state || item.location_suburb ? <Text style={styles.muted}>{[item.location_suburb, item.location_state].filter(Boolean).join(', ')}</Text> : null}
          {item.availability_summary ? <Text style={styles.muted}>{item.availability_summary}</Text> : null}
          {item.work_types?.length ? <Text style={styles.muted}>{item.work_types.join(' · ')}</Text> : null}
          <Button mode="outlined" contentStyle={styles.button} onPress={() => router.push(user ? '/explorer/talent-board' as any : { pathname: '/login', params: { returnTo: '/explore/talent-board' } } as any)}>
            {user ? 'Open talent workspace' : 'Sign in to contact talent'}
          </Button>
        </Card.Content></Card>) : <Text>No public talent listings are available yet.</Text>}
      {next !== null && !loading ? <Button mode="outlined" disabled={moreLoading} loading={moreLoading} onPress={() => void loadMore()}>Load more talent</Button> : null}
      {moreError ? <Text accessibilityRole="alert" style={styles.error}>{moreError}</Text> : null}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, paddingBottom: space['3xl'], gap: space.md },
  title: { color: colors.textPrimary, fontWeight: '700' },
  muted: { color: colors.textSecondary, lineHeight: 22 },
  card: { borderColor: colors.border, backgroundColor: colors.surfaceBg, borderRadius: radius.card },
  cardBody: { gap: space.sm },
  button: { minHeight: touch.min },
  status: { gap: space.md },
  error: { color: colors.status.red.fg },
});
