import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Button, Card, Searchbar, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PublicArticle, PublicContentKind } from '@chemisttasker/shared-core';
import { chemistTaskerApi } from '@/config/api';
import { colors, radius, space, touch } from '@/constants/tokens';
import { safePublicUrl } from './webLinks';

function followingPage(next: string | null): number | null {
  const found = /[?&]page=(\d+)(?:[&#]|$)/.exec(next || '');
  return found && Number.isSafeInteger(Number(found[1])) && Number(found[1]) > 1 ? Number(found[1]) : null;
}

function mergePage(existing: PublicArticle[], incoming: PublicArticle[]): PublicArticle[] {
  const combined = new Map<number, PublicArticle>();
  for (const article of existing) combined.set(article.id, article);
  for (const article of incoming) combined.set(article.id, article);
  return Array.from(combined.values());
}

export default function ArticleFeed({ section }: { section: 'learning' | 'blog' | 'news' }) {
  const router = useRouter();
  const requestRef = useRef(0);
  const pagingRef = useRef(false);
  const [rows, setRows] = useState<PublicArticle[]>([]);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');
  const kind: PublicContentKind | undefined = section === 'learning' ? undefined : section;
  const topic = section === 'learning' ? 'learning' : undefined;
  const title = section === 'learning' ? 'Learning' : section === 'blog' ? 'Blog' : 'News';

  useEffect(() => {
    const timer = setTimeout(() => setAppliedQuery(query.trim().slice(0, 200)), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    const ticket = ++requestRef.current;
    pagingRef.current = false;
    setLoading(true);
    setMoreLoading(false);
    setError('');
    setMoreError('');
    setRows([]);
    setNextPage(null);
    try {
      const data = await chemistTaskerApi.publicContent.listArticles({ topic, kind, q: appliedQuery || undefined });
      if (ticket !== requestRef.current) return;
      setRows(data.results || []);
      setNextPage(followingPage(data.next));
    } catch (failure: any) {
      if (ticket === requestRef.current) setError(failure?.message || 'Published articles could not load.');
    } finally {
      if (ticket === requestRef.current) setLoading(false);
    }
  }, [topic, kind, appliedQuery]);

  useEffect(() => { void load(); return () => { requestRef.current += 1; }; }, [load]);

  const loadMore = async () => {
    if (nextPage == null || pagingRef.current) return;
    const ticket = requestRef.current;
    pagingRef.current = true;
    setMoreLoading(true);
    setMoreError('');
    try {
      const data = await chemistTaskerApi.publicContent.listArticles({ page: nextPage, topic, kind, q: appliedQuery || undefined });
      if (ticket !== requestRef.current) return;
      setRows(existing => mergePage(existing, data.results || []));
      setNextPage(followingPage(data.next));
    } catch (failure: any) {
      if (ticket === requestRef.current) setMoreError(failure?.message || 'More articles could not load.');
    } finally {
      if (ticket === requestRef.current) { pagingRef.current = false; setMoreLoading(false); }
    }
  };

  return <SafeAreaView style={styles.page} edges={['top', 'left', 'right', 'bottom']}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Button icon="arrow-left" mode="text" onPress={() => router.canGoBack() ? router.back() : router.replace('/explore' as any)}>Explore</Button>
      <Text variant="headlineMedium" style={styles.title}>{title}</Text>
      <Text style={styles.muted}>{section === 'learning' ? 'Clinical and professional development articles.' : section === 'blog' ? 'Stories and perspectives from pharmacy.' : 'News and updates from the pharmacy sector.'}</Text>
      <Searchbar placeholder="Search published articles" value={query} onChangeText={setQuery} accessibilityLabel={'Search ' + title} />
      {loading ? <View style={styles.status}><ActivityIndicator /><Text>Loading published articles…</Text></View> :
       error ? <View style={styles.status}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Button mode="outlined" onPress={() => void load()}>Retry</Button></View> :
       rows.length ? rows.map(item => {
          const cover = safePublicUrl(item.cover_url, true);
          return <Card key={item.id} mode="outlined" style={styles.card} onPress={() => router.push({ pathname: '/explore/article/[slug]', params: { slug: item.slug } } as any)}>
            {cover ? <Image source={{ uri: cover }} resizeMode="cover" style={styles.cover} /> : null}
            <Card.Content style={styles.cardBody}>
              <Text style={styles.category}>{item.kind === 'news' ? 'NEWS' : 'ARTICLE'}{item.read_minutes > 0 ? ' · ' + item.read_minutes + ' MIN READ' : ''}</Text>
              <Text variant="titleMedium" style={styles.title}>{item.title}</Text>
              {item.excerpt ? <Text numberOfLines={3} style={styles.muted}>{item.excerpt}</Text> : null}
              <Text style={styles.action}>Read article</Text>
            </Card.Content>
          </Card>;
       }) : <View style={styles.status}><Text>No published articles match these filters.</Text><Button onPress={() => { setQuery(''); void load(); }}>Refresh</Button></View>}
      {moreError ? <Text accessibilityRole="alert" style={styles.error}>{moreError}</Text> : null}
      {nextPage !== null && !loading && !error ? <Button mode="outlined" disabled={moreLoading} loading={moreLoading} onPress={() => void loadMore()} contentStyle={styles.button}>Load more articles</Button> : null}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space['3xl'] },
  title: { color: colors.textPrimary, fontWeight: '700' },
  muted: { color: colors.textSecondary, lineHeight: 22 },
  card: { borderColor: colors.border, backgroundColor: colors.surfaceBg, borderRadius: radius.card, overflow: 'hidden' },
  cover: { height: 170, width: '100%' },
  cardBody: { paddingTop: space.md, gap: space.sm },
  category: { color: colors.primary, letterSpacing: 0.5, fontWeight: '700' },
  action: { color: colors.primary, minHeight: touch.min, textAlignVertical: 'center', fontWeight: '700' },
  status: { paddingVertical: space['2xl'], gap: space.md, alignItems: 'center' },
  button: { minHeight: touch.min },
  error: { color: colors.status.red.fg },
});
