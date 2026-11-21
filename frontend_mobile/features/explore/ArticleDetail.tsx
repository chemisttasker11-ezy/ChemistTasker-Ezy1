import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Linking, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { BrandActivityIndicator as ActivityIndicator } from '@/components/ui/BrandActivityIndicator';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PublicArticleComment, PublicArticleDetail as Article } from '@chemisttasker/shared-core';
import { chemistTaskerApi } from '@/config/api';
import { useAuth } from '@/context/AuthContext';
import { colors, radius, space } from '@/constants/tokens';
import { RichContent } from './RichContent';
import { publicWebUrl, safePublicUrl } from './webLinks';
import {
  type ActionScope,
  applyServerReplyPage,
  beginOperation,
  createTokenLock,
  type DiscussionReplyMap,
  handlePageFailure,
  incrementReplyCount,
  insertPostedReply,
  isScopeCurrent,
  markCommentDeleted,
  mergeItems,
  updateCommentReactions,
  updateReplyThread,
} from './discussionModel';

const displayDate = (value: string) => {
  try { return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Brisbane', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }
  catch { return ''; }
};

export function ArticleDetail({ slug }: { slug: string }) {
  const { user } = useAuth();
  const accountKey = String(user?.id ?? 'anonymous');
  return <ArticleDetailView key={`${accountKey}:${slug}`} slug={slug} accountKey={accountKey} />;
}

function ArticleDetailView({ slug, accountKey }: { slug: string; accountKey: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const generation = useRef(0);
  const writeLock = useRef(createTokenLock());
  const latestScopeRef = useRef<ActionScope>({ accountKey, routeKey: slug, generation: 0 });

  const [article, setArticle] = useState<Article | null>(null);
  const [comments, setComments] = useState<PublicArticleComment[]>([]);
  const [replyThreads, setReplyThreads] = useState<DiscussionReplyMap<PublicArticleComment>>({});
  const [loading, setLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [internalBusy, setBusy] = useState(false);
  const [paging, setPaging] = useState(false);
  const busy = internalBusy || paging || Object.values(replyThreads).some(t => Boolean(t?.loading || t?.paging));
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [page, setPage] = useState<number | null>(null);
  const [reportId, setReportId] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    latestScopeRef.current.generation = ticket;
    setLoading(true); setError(''); setActionError(''); setBusy(false);
    writeLock.current.forceRelease();
    setArticle(null); setComments([]); setReplyThreads({}); setPage(null); setPaging(false); setReplyTo(null); setReportId(null); setReason('');
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
    const activity = writeLock.current;
    // Defer initial load until after effects subscribe; stale generations cannot overwrite state.
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => {
      active = false;
      generation.current += 1;
      latestScopeRef.current.generation = generation.current;
      activity.forceRelease();
    };
  }, [load]);

  const requiresSignIn = () => {
    router.push({ pathname: '/login', params: { returnTo: '/explore/article/' + encodeURIComponent(slug) } } as any);
  };

  const sendComment = async () => {
    if (!article?.comments_open || !user || !message.trim()) return;
    const op = beginOperation(writeLock.current, latestScopeRef.current);
    if (!op) return;
    const { ticket, snapshot } = op;
    setBusy(true); setActionError('');
    const targetParent = replyTo;
    try {
      const created = await chemistTaskerApi.publicContent.createArticleComment(slug, {
        body: message.trim(),
        ...(targetParent === null ? {} : { parent: targetParent }),
      });
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      setMessage('');
      setReplyTo(null);
      if (targetParent !== null) {
        setReplyThreads(threads => insertPostedReply(threads, targetParent, created));
        setComments(old => incrementReplyCount(old, targetParent));
      } else {
        setComments(old => mergeItems([created], old));
      }
    } catch (failure: any) {
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setActionError(failure?.message || 'Comment could not be published. Retry safely.');
      }
    } finally {
      writeLock.current.release(ticket);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setBusy(false);
      }
    }
  };

  const deleteComment = async (comment: PublicArticleComment, rootId?: number) => {
    if (!user || !comment.can_delete || comment.deleted) return;
    const op = beginOperation(writeLock.current, latestScopeRef.current);
    if (!op) return;
    const { ticket, snapshot } = op;
    setBusy(true); setActionError('');
    try {
      await chemistTaskerApi.publicContent.deleteArticleComment(comment.id);
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      if (rootId) {
        setReplyThreads(threads => updateReplyThread(threads, rootId, cur => ({
          ...cur,
          items: markCommentDeleted(cur.items, comment.id),
        })));
      } else {
        setComments(old => markCommentDeleted(old, comment.id));
      }
    } catch (failure: any) {
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setActionError(failure?.message || 'Unable to delete this comment.');
      }
    } finally {
      writeLock.current.release(ticket);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setBusy(false);
      }
    }
  };

  const loadMoreComments = async () => {
    if (page === null) return;
    const op = beginOperation(writeLock.current, latestScopeRef.current);
    if (!op) return;
    const { ticket, snapshot } = op;
    setPaging(true); setActionError('');
    try {
      const response = await chemistTaskerApi.publicContent.listArticleComments(slug, { page });
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      setComments(old => mergeItems(old, response.results || []));
      setPage(response.next ? page + 1 : null);
    } catch (failure: any) {
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setComments(old => handlePageFailure(old, failure).items);
        setActionError(failure?.message || 'Older comments could not load.');
      }
    } finally {
      writeLock.current.release(ticket);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setPaging(false);
      }
    }
  };

  const toggleReplies = async (rootComment: PublicArticleComment) => {
    const rootId = rootComment.id;
    const current = replyThreads[rootId];
    if (current?.serverLoaded && current.expanded) {
      setReplyThreads(threads => updateReplyThread(threads, rootId, prev => ({ ...prev, expanded: false })));
      return;
    }
    if (current?.serverLoaded && !current.expanded) {
      setReplyThreads(threads => updateReplyThread(threads, rootId, prev => ({ ...prev, expanded: true, error: '' })));
      return;
    }
    const op = beginOperation(writeLock.current, latestScopeRef.current);
    if (!op) return;
    const { ticket, snapshot } = op;
    setReplyThreads(threads => updateReplyThread(threads, rootId, prev => ({ ...prev, loading: true, error: '', expanded: true })));
    try {
      const response = await chemistTaskerApi.publicContent.listArticleComments(slug, { parent: rootId, page: 1 });
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      setReplyThreads(threads => updateReplyThread(threads, rootId, prev =>
        applyServerReplyPage(prev, 1, response.results || [], response.next)
      ));
    } catch (failure: any) {
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      setReplyThreads(threads => updateReplyThread(threads, rootId, prev => ({
        ...prev,
        loading: false,
        error: failure?.message || 'Replies could not load. Retry.',
      })));
    } finally {
      writeLock.current.release(ticket);
    }
  };

  const loadMoreReplies = async (rootId: number) => {
    const current = replyThreads[rootId];
    if (!current || current.nextPage === null) return;
    const nextPage = current.nextPage;
    const op = beginOperation(writeLock.current, latestScopeRef.current);
    if (!op) return;
    const { ticket, snapshot } = op;
    setReplyThreads(threads => updateReplyThread(threads, rootId, prev => ({ ...prev, paging: true, error: '' })));
    try {
      const response = await chemistTaskerApi.publicContent.listArticleComments(slug, { parent: rootId, page: nextPage });
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      setReplyThreads(threads => updateReplyThread(threads, rootId, prev =>
        applyServerReplyPage(prev, nextPage, response.results || [], response.next)
      ));
    } catch (failure: any) {
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      setReplyThreads(threads => updateReplyThread(threads, rootId, prev => ({
        ...prev,
        paging: false,
        items: handlePageFailure(prev.items, failure).items,
        error: failure?.message || 'More replies could not load.',
      })));
    } finally {
      writeLock.current.release(ticket);
    }
  };

  const reactComment = async (comment: PublicArticleComment, kind: 'like' | 'insightful' | 'support', rootId?: number) => {
    if (!user) return requiresSignIn();
    if (comment.deleted) return;
    const op = beginOperation(writeLock.current, latestScopeRef.current);
    if (!op) return;
    const { ticket, snapshot } = op;
    setBusy(true); setActionError('');
    try {
      const summary = comment.reactions?.mine === kind
        ? await chemistTaskerApi.publicContent.removeArticleCommentReaction(comment.id)
        : await chemistTaskerApi.publicContent.reactToArticleComment(comment.id, { kind });
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      if (rootId) {
        setReplyThreads(threads => updateReplyThread(threads, rootId, cur => ({
          ...cur,
          items: updateCommentReactions(cur.items, comment.id, summary),
        })));
      } else {
        setComments(old => updateCommentReactions(old, comment.id, summary));
      }
    } catch (failure: any) {
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setActionError(failure?.message || 'Could not update reaction.');
      }
    } finally {
      writeLock.current.release(ticket);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setBusy(false);
      }
    }
  };

  const reportComment = async () => {
    if (!user || reportId === null || !reason.trim()) return;
    const op = beginOperation(writeLock.current, latestScopeRef.current);
    if (!op) return;
    const { ticket, snapshot } = op;
    setBusy(true); setActionError('');
    try {
      await chemistTaskerApi.publicContent.reportArticleComment(reportId, { reason: reason.trim() });
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setReportId(null);
        setReason('');
      }
    } catch (failure: any) {
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setActionError(failure?.message || 'Could not report comment.');
      }
    } finally {
      writeLock.current.release(ticket);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setBusy(false);
      }
    }
  };

  const react = async (kind: 'like' | 'insightful' | 'support') => {
    if (!user) return requiresSignIn();
    if (!article) return;
    const op = beginOperation(writeLock.current, latestScopeRef.current);
    if (!op) return;
    const { ticket, snapshot } = op;
    setBusy(true); setActionError('');
    try {
      const summary = article.reactions.mine === kind
        ? await chemistTaskerApi.publicContent.removeArticleReaction(slug)
        : await chemistTaskerApi.publicContent.reactToArticle(slug, { kind });
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      setArticle(old => old ? { ...old, reactions: summary } : null);
    } catch (failure: any) {
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setActionError(failure?.message || 'Could not update reaction.');
      }
    } finally {
      writeLock.current.release(ticket);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setBusy(false);
      }
    }
  };

  const share = async () => {
    if (!article) return;
    try { await Share.share({ message: publicWebUrl('/' + article.kind + '/' + encodeURIComponent(article.slug)) }); }
    catch { setActionError('Sharing is unavailable on this device.'); }
  };

  const reactionChoices = [
    { kind: 'like' as const, label: 'Helpful' },
    { kind: 'insightful' as const, label: 'Insightful' },
    { kind: 'support' as const, label: 'Support' },
  ];

  const renderCommentReactions = (comment: PublicArticleComment, rootId?: number) => {
    if (comment.deleted) return null;
    return (
      <View style={styles.commentReactions} accessibilityRole="toolbar" accessibilityLabel="Comment reactions">
        {reactionChoices.map(({ kind, label }) => {
          const count = comment.reactions?.counts?.[kind] || 0;
          const selected = comment.reactions?.mine === kind;
          return (
            <Button
              key={kind}
              mode={selected ? 'contained-tonal' : 'outlined'}
              compact
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${count} reactions${selected ? ', selected' : ''}`}
              accessibilityState={{ selected }}
              onPress={() => void reactComment(comment, kind, rootId)}
            >
              {label} · {count}
            </Button>
          );
        })}
      </View>
    );
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
          <View style={styles.actions}>
            <Button mode="outlined" icon="share-variant" onPress={() => void share()}>Share</Button>
            {(['like','insightful','support'] as const).map(kind => <Button key={kind} mode={article.reactions.mine === kind ? 'contained-tonal' : 'outlined'}
              disabled={busy} onPress={() => void react(kind)}>{kind === 'like' ? 'Helpful' : kind === 'insightful' ? 'Insightful' : 'Support'} · {article.reactions.counts[kind] || 0}</Button>)}
          </View>
          <Card mode="outlined" style={styles.card}><Card.Content style={styles.comments}>
            <Text variant="titleLarge" style={styles.title}>Discussion</Text>
            {commentsLoading ? <ActivityIndicator /> : comments.length === 0 ? <Text style={styles.subtitle}>No comments yet.</Text> : comments.map(row => {
              const thread = replyThreads[row.id];
              return (
                <View key={row.id} style={styles.comment}>
                  <Text variant="titleSmall">{row.author_name}</Text>
                  <Text style={styles.subtitle}>{row.deleted ? 'Comment removed' : row.body}</Text>
                  <Text style={styles.meta}>{displayDate(row.created_at)}</Text>
                  {renderCommentReactions(row)}
                  <View style={styles.commentActions}>
                    {row.can_delete && user && !row.deleted ? <Button mode="text" disabled={busy} onPress={() => void deleteComment(row)}>Delete my comment</Button> : null}
                    {!row.deleted && article.comments_open ? <Button mode="text" onPress={() => user ? setReplyTo(row.parent || row.id) : requiresSignIn()}>Reply</Button> : null}
                    {!row.deleted && user ? <Button mode="text" disabled={busy} onPress={() => { setReportId(row.id); setReason(''); }}>Report comment</Button> : null}
                    {(row.reply_count > 0 || (thread?.items.length ?? 0) > 0) ? <Button mode="text" compact disabled={busy} icon={thread?.expanded && thread.serverLoaded ? 'chevron-up' : 'chevron-down'} onPress={() => void toggleReplies(row)}>{thread?.expanded ? (!thread.serverLoaded ? 'View all replies' : 'Hide replies') : `View ${row.reply_count} ${row.reply_count === 1 ? 'reply' : 'replies'}`}</Button> : null}
                  </View>
                  {thread?.expanded ? <View style={styles.repliesList}>
                    {thread.loading ? <ActivityIndicator size="small" style={styles.replyStatus} /> : null}
                    {thread.items.map(reply => (
                      <View key={reply.id} style={styles.replyItem}>
                        <Text variant="titleSmall">{reply.author_name}</Text>
                        <Text style={styles.subtitle}>{reply.deleted ? 'Comment removed' : reply.body}</Text>
                        <Text style={styles.meta}>{displayDate(reply.created_at)}</Text>
                        {renderCommentReactions(reply, row.id)}
                        <View style={styles.commentActions}>
                          {reply.can_delete && user && !reply.deleted ? <Button mode="text" compact disabled={busy} onPress={() => void deleteComment(reply, row.id)}>Delete my comment</Button> : null}
                          {!reply.deleted && article.comments_open ? <Button mode="text" compact onPress={() => user ? setReplyTo(row.id) : requiresSignIn()}>Reply</Button> : null}
                          {!reply.deleted && user ? <Button mode="text" compact disabled={busy} onPress={() => { setReportId(reply.id); setReason(''); }}>Report comment</Button> : null}
                        </View>
                      </View>
                    ))}
                    {thread.nextPage !== null ? <Button mode="text" compact disabled={thread.paging || busy} loading={thread.paging} onPress={() => void loadMoreReplies(row.id)}>Load more replies</Button> : null}
                    {thread.error ? <View style={styles.replyError}><Text style={styles.error} accessibilityRole="alert">{thread.error}</Text><Button mode="text" compact disabled={thread.paging || busy} onPress={() => void loadMoreReplies(row.id)}>Retry replies</Button></View> : null}
                  </View> : null}
                </View>
              );
            })}
            {page !== null ? <Button mode="outlined" disabled={paging || busy} loading={paging} onPress={() => void loadMoreComments()}>Load more comments</Button> : null}
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
  commentActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignItems: 'center' },
  commentReactions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginVertical: space.xs },
  repliesList: { paddingLeft: space.md, borderLeftWidth: 2, borderLeftColor: colors.border, marginTop: space.sm, gap: space.sm },
  replyItem: { gap: space.xs, paddingVertical: space.xs },
  replyStatus: { marginVertical: space.xs },
  replyError: { gap: space.xs, paddingVertical: space.xs },
  status: { paddingVertical: space['2xl'], alignItems: 'center', gap: space.md },
  warning: { gap: space.sm },
  error: { color: colors.status.red.fg },
});
