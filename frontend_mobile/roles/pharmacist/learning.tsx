import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Button, Card, Chip, Text, TextInput } from 'react-native-paper';
import type { PublicArticle } from '@chemisttasker/shared-core';
import { chemistTaskerApi } from '@/config/api';
import { useAuth } from '@/context/AuthContext';
import { ContentState } from '@/components/ui/ContentState';
import { colors, space, radius, font, touch } from '@/constants/tokens';

type Kind = 'all' | 'blog' | 'news';

const rolePath: Record<string, string> = {
  OWNER: 'Business, leadership and pharmacy operations',
  ORGANIZATION: 'Pharmacy leadership and team development',
  PHARMACIST: 'Clinical practice, career and professional development',
  INTERN: 'Internship, registration and workplace development',
  STUDENT: 'Study, placement and transition to practice',
  TECHNICIAN: 'Dispensary workflow and workplace development',
  ASSISTANT: 'Customer service and workplace development',
  EXPLORER: 'Career discovery and pharmacy pathways',
};

function getNextPage(next: string | null): number | null {
  if (!next) return null;
  const match = /[?&]page=(\\d+)(?:[&#]|$)/.exec(next);
  const page = match ? Number(match[1]) : null;
  return page != null && Number.isSafeInteger(page) && page > 1 ? page : null;
}

function articleHref(item: PublicArticle): string {
  const configured = process.env.EXPO_PUBLIC_WEB_URL?.trim();
  const origin = configured && /^https:\/\//i.test(configured) ? configured : 'https://app.chemisttasker.com';
  return `${origin.replace(/\\/$/, '')}/${item.kind}/${encodeURIComponent(item.slug)}`;
}

export default function LearningScreen() {
  const { user } = useAuth();
  const generation = useRef(0);
  const [articles, setArticles] = useState<PublicArticle[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState(false);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [openError, setOpenError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    setMoreError(false);
    try {
      const page = await chemistTaskerApi.publicContent.listArticles({ topic: 'learning' });
      if (request !== generation.current) return;
      setArticles(page.results ?? []);
      setNextPage(getNextPage(page.next));
    } catch (failure: any) {
      if (request === generation.current) setError(failure?.message || 'Learning resources could not load.');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]));

  const showMore = useCallback(async () => {
    if (nextPage == null || loadingMore) return;
    const request = generation.current;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await chemistTaskerApi.publicContent.listArticles({ topic: 'learning', page: nextPage });
      if (request !== generation.current) return;
      setArticles(previous => {
        const ids = new Set(previous.map(item => item.id));
        return [...previous, ...(page.results ?? []).filter(item => !ids.has(item.id))];
      });
      setNextPage(getNextPage(page.next));
    } catch {
      if (request === generation.current) setMoreError(true);
    } finally {
      if (request === generation.current) setLoadingMore(false);
    }
  }, [nextPage, loadingMore]);

  const visible = useMemo(() => articles.filter(article => {
    if (kind !== 'all' && article.kind !== kind) return false;
    const text = query.trim().toLowerCase();
    return !text || [article.title, article.excerpt, article.author_name].some(value => String(value || '').toLowerCase().includes(text));
  }), [articles, kind, query]);
  const roleCode = String(user?.role || '').toUpperCase();
  const pathway = rolePath[roleCode];

  const openArticle = useCallback(async (article: PublicArticle) => {
    setOpenError(null);
    try { await Linking.openURL(articleHref(article)); }
    catch { setOpenError('This article could not be opened. Please try again.'); }
  }, []);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text variant="headlineMedium" style={styles.title}>Learning materials</Text>
        <Text style={styles.subtitle}>Discover pharmacy learning, industry news and career development resources.</Text>
      </View>
      {pathway ? <Card mode="outlined" style={styles.pathway}><Card.Content><Text style={styles.eyebrow}>YOUR PATHWAY</Text><Text style={styles.pathwayText}>{pathway}</Text></Card.Content></Card> : null}
      {loading ? <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.subtitle}>Loading resources…</Text></View> :
        error ? <ContentState kind="error" title="Learning resources are unavailable" description={error} actionLabel="Try again" onAction={() => void load()} /> :
        articles.length === 0 ? <ContentState kind="empty" title="No learning resources yet" description="Learning articles and industry news will appear here when published." actionLabel="Refresh" onAction={() => void load()} /> : <>
          <TextInput mode="outlined" placeholder="Search resources" value={query} onChangeText={setQuery} left={<TextInput.Icon icon="magnify" />} accessibilityLabel="Search learning resources" />
          <View style={styles.filters}>
            {(['all', 'blog', 'news'] as const).map(value => <Chip key={value} selected={kind === value} onPress={() => setKind(value)} style={kind === value ? styles.selectedChip : undefined}>{value === 'all' ? 'All' : value === 'blog' ? 'Articles' : 'News'}</Chip>)}
          </View>
          {openError ? <Text accessibilityRole="alert" style={styles.error}>{openError}</Text> : null}
          {visible.length === 0 ? <ContentState kind="empty" title="No matching resources" description="Try a different search or resource type." actionLabel="Clear filters" onAction={() => { setQuery(''); setKind('all'); }} /> :
            visible.map(article => {
              const image = /^https:\/\//i.test(article.cover_url || '') ? article.cover_url : null;
              return <Card key={article.id} mode="outlined" style={[styles.article, article.featured && styles.featured]} onPress={() => void openArticle(article)} accessibilityLabel={`Open ${article.title}`}>
                {image ? <Card.Cover source={{ uri: image }} style={styles.cover} /> : <View style={styles.imagePlaceholder}><Text style={styles.placeholderTitle}>{article.kind === 'news' ? 'NEWS' : 'LEARNING'}</Text></View>}
                <Card.Content style={styles.articleContent}>
                  <Text style={styles.eyebrow}>{article.kind === 'news' ? 'NEWS' : 'ARTICLE'}{article.read_minutes > 0 ? `  ·  ${article.read_minutes} MIN READ` : ''}</Text>
                  <Text variant="titleMedium" style={styles.articleTitle}>{article.title}</Text>
                  {article.excerpt ? <Text numberOfLines={3} style={styles.subtitle}>{article.excerpt}</Text> : null}
                  {article.author_name ? <Text style={styles.byline}>{article.author_name}</Text> : null}
                  <Text style={styles.open}>Read resource →</Text>
                </Card.Content>
              </Card>;
            })}
          {nextPage != null ? <View style={styles.more}>
            {moreError ? <Text accessibilityRole="alert" style={styles.error}>More resources could not load. Your current results are still available.</Text> : null}
            <Button mode="outlined" onPress={() => void showMore()} loading={loadingMore} disabled={loadingMore} contentStyle={styles.loadButton}>Show more resources</Button>
          </View> : null}
        </>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, paddingBottom: space['3xl'], gap: space.lg },
  header: { gap: space.sm },
  title: { fontFamily: font.outfit.semiBold, color: colors.textPrimary },
  subtitle: { color: colors.textSecondary, lineHeight: 21 },
  pathway: { borderRadius: radius.card, borderColor: colors.border, backgroundColor: colors.surfaceBg },
  eyebrow: { color: colors.tone.violet.fg, fontFamily: font.inter.semiBold, fontSize: 11, letterSpacing: 0.5 },
  pathwayText: { color: colors.textPrimary, marginTop: 6, fontFamily: font.inter.semiBold, fontSize: 15 },
  loading: { paddingVertical: space['3xl'], alignItems: 'center', gap: space.md },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  selectedChip: { backgroundColor: colors.primarySoft },
  article: { borderColor: colors.border, borderRadius: radius.card, backgroundColor: colors.surfaceBg, overflow: 'hidden' },
  featured: { borderColor: colors.primary },
  cover: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, height: 154 },
  imagePlaceholder: { height: 112, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  placeholderTitle: { fontFamily: font.outfit.semiBold, color: colors.primary },
  articleContent: { paddingTop: space.md, gap: space.sm },
  articleTitle: { color: colors.textPrimary, fontFamily: font.outfit.semiBold },
  byline: { color: colors.textMuted, fontSize: 12 },
  open: { color: colors.primary, fontFamily: font.inter.semiBold, marginTop: space.xs, minHeight: touch.min, textAlignVertical: 'center' },
  more: { gap: space.sm, alignItems: 'stretch' },
  loadButton: { minHeight: touch.min },
  error: { color: colors.status.red.fg },
});
