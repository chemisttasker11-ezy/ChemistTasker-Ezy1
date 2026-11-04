import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Linking, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Button, Card, Text, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PublicArticleComment, PublicArticleDetail as Article } from '@chemisttasker/shared-core';
import { chemistTaskerApi } from '@/config/api';
import { useAuth } from '@/context/AuthContext';
import { colors, radius, space, touch } from '@/constants/tokens';
import { RichContent } from './RichContent';
import { publicWebUrl, safePublicUrl } from './webLinks';

const displayDate = (value: string) => {
  try { return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Brisbane', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }
  catch { return ''; }
};

export function ArticleDetail({ slug }: { slug: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const generation = useRef(0);
  const submitting = useRef(false);
  const [article, setArticle] = useState<Article | null>(null);
  const [comments, setComments] = useState<PublicArticleComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [page, setPage] = useState<number | null>(null);
  const [paging, setPaging] = useState(false);
  const [reportId, setReportId] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true); setError(''); setActionError('');
    setArticle(null); setComments([]); setPage(null); setPaging(false); setReplyTo(null);
    try {
      const result = await chemistTaskerApi.publicContent.getArticle(slug);
      if (ticket !== generation.current) return;
      setArticle(result);
      // Closed discussions remain readable; only new comments are blocked.
      setCommentsLoading(true);
      try {
        const discussion = await chemistTaskerApi.publicContent.listArticleComments(slug);
        if (ticket === generation.current) { setComments(discussion.results || []); setPage(discussion.next ? 2 : null); }
      } catch { if (ticket === generation.current) setActionError('Comments are unavailable. You can still read the article.'); }
    } catch (failure: any) {
      if (ticket === generation.current) setError(failure?.message || 'Article could not load.');
    } finally {
      if (ticket === generation.current) { setLoading(false); setCommentsLoading(false); }
    }
  }, [slug]);

  useEffect(() => {
    let active = true;
    // Defer initial load until after effects subscribe; stale generations cannot overwrite state.
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; generation.current += 1; };
  }, [load]);

  const requiresSignIn = () => {
    router.push({ pathname: '/login', params: { returnTo: '/explore/article/' + encodeURIComponent(slug) } } as any);
  };
  const sendComment = async () => {
    if (!article?.comments_open || !user || !message.trim() || submitting.current) return;
    const ticket = generation.current;
    submitting.current = true; setBusy(true); setActionError('');
    try {
      await chemistTaskerApi.publicContent.createArticleComment(slug, { body: message.trim(), ...(replyTo === null ? {} : { parent: replyTo }) });
      if (ticket !== generation.current) return;
      setMessage(''); setReplyTo(null);
      const response = await chemistTaskerApi.publicContent.listArticleComments(slug);
      if (ticket === generation.current) { setComments(response.results || []); setPage(response.next ? 2 : null); }
    } catch (failure: any) {
      if (ticket === generation.current) setActionError(failure?.message || 'Comment could not be published. Retry safely.');
    } finally {
      submitting.current = false;
      if (ticket === generation.current) setBusy(false);
    }
  };
  const deleteComment = async (comment: PublicArticleComment) => {
    if (!user || !comment.can_delete || busy) return;
    const ticket = generation.current;
    setBusy(true); setActionError('');
    try {
      await chemistTaskerApi.publicContent.deleteArticleComment(comment.id);
      const response = await chemistTaskerApi.publicContent.listArticleComments(slug);
      if (ticket === generation.current) { setComments(response.results || []); setPage(response.next ? 2 : null); }
    } catch (failure: any) {
      if (ticket === generation.current) setActionError(failure?.message || 'Unable to delete this comment.');
    } finally { if (ticket === generation.current) setBusy(false); }
  };
  const loadMoreComments = async () => {
    if (page === null || paging) return;
    const ticket = generation.current;
    setPaging(true); setActionError('');
    try {
      const response = await chemistTaskerApi.publicContent.listArticleComments(slug, { page });
      if (ticket !== generation.current) return;
      setComments(old => {
        const merged = new Map(old.map(comment => [comment.id, comment]));
        for (const comment of response.results || []) merged.set(comment.id, comment);
        return [...merged.values()];
      });
      setPage(response.next ? page + 1 : null);
    } catch (failure: any) {
      if (ticket === generation.current) setActionError(failure?.message || 'Older comments could not load.');
    } finally { if (ticket === generation.current) setPaging(false); }
  };
  const reportComment = async () => {
    if (!user || reportId === null || !reason.trim() || busy) return;
    const ticket = generation.current;
    setBusy(true); setActionError('');
    try {
      await chemistTaskerApi.publicContent.reportArticleComment(reportId, { reason: reason.trim() });
      if (ticket === generation.current) { setReportId(null); setReason(''); }
    } catch (failure: any) {
      if (ticket === generation.current) setActionError(failure?.message || 'Could not report comment.');
    } finally { if (ticket === generation.current) setBusy(false); }
  };
  const react = async () => {
    if (!user) return requiresSignIn();
    if (!article || busy) return;
    const ticket = generation.current;
    setBusy(true); setActionError('');
    try {
      const summary = article.reactions.mine
        ? await chemistTaskerApi.publicContent.removeArticleReaction(slug)
        : await chemistTaskerApi.publicContent.reactToArticle(slug, { kind: 'like' });
      if (ticket === generation.current) setArticle(old => old ? { ...old, reactions: summary } : null);
    } catch (failure: any) {
      if (ticket === generation.current) setActionError(failure?.message || 'Could not update reaction.');
    } finally { if (ticket === generation.current) setBusy(false); }
  };

  const share = async () => {
    if (!article) return;
    try { await Share.share({ message: publicWebUrl('/' + article.kind + '/' + encodeURIComponent(article.slug)) }); }
    catch { setActionError('Sharing is unavailable on this device.'); }
  };

  return <SafeAreaView style={styles.page} edges={['top','left','right','bottom']}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Button mode="text" icon="arrow-left" onPress={() => router.canGoBack() ? router.back() : router.replace('/explore' as any)}>Back</Button>
      {loading ? <View style={styles.status}><ActivityIndicator /><Text>Loading article…</Text></View> : error ?
        <View style={styles.status}><Text style={styles.error} accessibilityRole="alert">{error}</Text><Button onPress={() => void load()}>Retry</Button></View> :
        !article ? <Text>Article not found.</Text> : <>
          <Text variant="headlineMedium" style={styles.title}>{article.title}</Text>
          <Text style={styles.subtitle}>{article.excerpt}</Text>
          <Text style={styles.meta}>{article.author_name || 'ChemistTasker Editorial'} · {displayDate(article.published_at)} · {article.read_minutes} min read</Text>
          {safePublicUrl(article.cover_url, true) ? <Image accessible accessibilityLabel={article.cover_alt || 'Article cover'} source={{uri: safePublicUrl(article.cover_url, true)!}} style={styles.image} resizeMode="cover" /> : null}
          <RichContent document={article.body_document} fallback={article.body} />
          {safePublicUrl(article.source_url) ? <Button mode="outlined" icon="open-in-new" onPress={() => void Linking.openURL(safePublicUrl(article.source_url)!).catch(() => setActionError('Original source unavailable.'))}>Original source: {article.source_name || 'Website'}</Button> : null}
          <View style={styles.actions}><Button mode="outlined" icon="share-variant" onPress={() => void share()}>Share</Button><Button mode="outlined" onPress={() => void react()} disabled={busy}>{article.reactions.mine ? 'Unlike' : 'Like'}</Button></View>
          <Card mode="outlined" style={styles.card}><Card.Content style={styles.comments}>
            <Text variant="titleLarge" style={styles.title}>Discussion</Text>
            {commentsLoading ? <ActivityIndicator /> : comments.length === 0 ? <Text style={styles.subtitle}>No comments yet.</Text> : comments.map(row => <View key={row.id} style={styles.comment}>
              <Text variant="titleSmall">{row.author_name}</Text>
              <Text style={styles.subtitle}>{row.deleted ? 'Comment removed' : row.body}</Text>
              <Text style={styles.meta}>{displayDate(row.created_at)}</Text>
              {row.can_delete && user && !row.deleted ? <Button mode="text" disabled={busy} onPress={() => void deleteComment(row)}>Delete my comment</Button> : null}
              {!row.deleted && article.comments_open ? <Button mode="text" onPress={() => user ? setReplyTo(row.parent || row.id) : requiresSignIn()}>Reply</Button> : null}
              {!row.deleted && user ? <Button mode="text" disabled={busy} onPress={() => { setReportId(row.id); setReason(''); }}>Report comment</Button> : null}
            </View>)}
            {page !== null ? <Button mode="outlined" disabled={paging} loading={paging} onPress={() => void loadMoreComments()}>Load more comments</Button> : null}
            {reportId !== null ? <View style={styles.warning}>
              <TextInput mode="outlined" label="Reason for reporting" multiline maxLength={500} value={reason} onChangeText={setReason} disabled={busy} />
              <Button mode="contained" onPress={() => void reportComment()} disabled={busy || !reason.trim()}>Send report</Button>
              <Button mode="text" onPress={() => setReportId(null)}>Cancel report</Button>
            </View> : null}
            {!article.comments_open ? <Text style={styles.meta}>Comments are closed for this article.</Text> : user ? <>
              {replyTo !== null ? <Button onPress={() => setReplyTo(null)}>Cancel reply</Button> : null}
              <TextInput mode="outlined" label={replyTo !== null ? 'Write reply' : 'Add a comment'} multiline value={message} onChangeText={setMessage} maxLength={3000} disabled={busy} />
              <Button mode="contained" disabled={busy || !message.trim()} loading={busy} onPress={() => void sendComment()}>{replyTo !== null ? 'Post reply' : 'Post comment'}</Button>
            </> : <Button mode="outlined" onPress={requiresSignIn}>Sign in to join the discussion</Button>}
          </Card.Content></Card>
          {actionError ? <View style={styles.warning}><Text style={styles.error} accessibilityRole="alert">{actionError}</Text><Button onPress={() => void load()}>Retry loading</Button></View> : null}
        </>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, paddingBottom: space['3xl'], gap: space.lg },
  title: { color: colors.textPrimary, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, lineHeight: 22 },
  meta: { color: colors.textMuted, fontSize: 12, lineHeight: 20 },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.card },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  comments: { gap: space.md },
  card: { borderColor: colors.border, backgroundColor: colors.surfaceBg, borderRadius: radius.card },
  comment: { gap: space.xs, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  status: { paddingVertical: space['2xl'], alignItems: 'center', gap: space.md },
  warning: { gap: space.sm },
  error: { color: colors.status.red.fg },
});
