import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { BrandActivityIndicator as ActivityIndicator } from '@/components/ui/BrandActivityIndicator';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PublicHubComment, PublicHubPost } from '@chemisttasker/shared-core';
import { chemistTaskerApi } from '@/config/api';
import { useAuth } from '@/context/AuthContext';
import { RichContent } from '@/features/explore/RichContent';
import { publicWebUrl, safePublicUrl } from '@/features/explore/webLinks';
import {
  type ActionScope,
  beginOperation,
  createTokenLock,
  handlePageFailure,
  isScopeCurrent,
  mergeItems,
  refreshLoadedPublicPages,
} from '@/features/explore/discussionModel';
import { colors, radius, space, touch } from '@/constants/tokens';

export default function PublicHubPostDetail() {
  const { user } = useAuth();
  const accountKey = String(user?.id ?? 'anonymous');
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  return <PublicHubPostView key={`${accountKey}:${id}`} id={id} accountKey={accountKey} />;
}

function PublicHubPostView({ id, accountKey }: { id: number; accountKey: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const requestRef = useRef(0);
  const writeLock = useRef(createTokenLock());
  const loadedPageCountRef = useRef(1);
  const latestScopeRef = useRef<ActionScope>({ accountKey, routeKey: String(id), generation: 0 });

  const [post, setPost] = useState<PublicHubPost | null>(null);
  const [comments, setComments] = useState<PublicHubComment[]>([]);
  const [commentsNextPage, setCommentsNextPage] = useState<number | null>(null);
  const [commentsPaging, setCommentsPaging] = useState(false);
  const [commentsPagingError, setCommentsPagingError] = useState('');
  const [loading, setLoading] = useState(true);
  const [internalBusy, setBusy] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const busy = internalBusy || commentsPaging;
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [comment, setComment] = useState('');
  const [reply, setReply] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | 'post' | null>(null);
  const [editBody, setEditBody] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState('');

  const load = useCallback(async () => {
    const ticket = ++requestRef.current;
    latestScopeRef.current.generation = ticket;
    setLoading(true); setError(''); setActionError(''); setBusy(false); setRefreshFailed(false);
    writeLock.current.forceRelease();
    setPost(null); setComments([]); setCommentsNextPage(null); setCommentsPaging(false); setCommentsPagingError('');
    loadedPageCountRef.current = 1;
    try {
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid post link.');
      const [current, replies] = await Promise.all([
        chemistTaskerApi.publicContent.getPost(id),
        chemistTaskerApi.publicContent.listPostComments(id),
      ]);
      if (ticket !== requestRef.current) return;
      setPost(current);
      setComments(replies.results || []);
      setCommentsNextPage(replies.next ? 2 : null);
    } catch (failure: any) {
      if (ticket === requestRef.current) setError(failure?.message || 'Post could not load.');
    } finally { if (ticket === requestRef.current) setLoading(false); }
  }, [id, accountKey]);

  useEffect(() => {
    let active = true;
    const activity = writeLock.current;
    // Defer initial load until after effects subscribe; stale generations cannot overwrite state.
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => {
      active = false;
      requestRef.current += 1;
      latestScopeRef.current.generation = requestRef.current;
      activity.forceRelease();
    };
  }, [load]);

  const signIn = () => router.push({ pathname: '/login', params: { returnTo: '/explore/hubs/post/' + id } } as any);

  const refreshAfterMutation = async (snapshot: ActionScope) => {
    const [refreshedPost, refreshedComments] = await Promise.all([
      chemistTaskerApi.publicContent.getPost(id),
      refreshLoadedPublicPages(
        p => chemistTaskerApi.publicContent.listPostComments(id, { page: p }),
        loadedPageCountRef.current
      ),
    ]);
    if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
    setPost(refreshedPost);
    setComments(refreshedComments.items);
    setCommentsNextPage(refreshedComments.nextPage);
  };

  const retryRefresh = async () => {
    const op = beginOperation(writeLock.current, latestScopeRef.current);
    if (!op) return;
    const { ticket, snapshot } = op;
    setBusy(true); setActionError('');
    try {
      await refreshAfterMutation(snapshot);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) setRefreshFailed(false);
    } catch (failure: any) {
      if (isScopeCurrent(latestScopeRef.current, snapshot)) setActionError(failure?.message || 'Refresh failed. Reload comments.');
    } finally {
      writeLock.current.release(ticket);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) setBusy(false);
    }
  };

  const loadMoreComments = async () => {
    if (commentsNextPage === null) return;
    const op = beginOperation(writeLock.current, latestScopeRef.current);
    if (!op) return;
    const { ticket, snapshot } = op;
    const targetPage = commentsNextPage;
    setCommentsPaging(true); setCommentsPagingError('');
    try {
      const response = await chemistTaskerApi.publicContent.listPostComments(id, { page: targetPage });
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      setComments(prev => mergeItems(prev, response.results || []));
      setCommentsNextPage(response.next ? targetPage + 1 : null);
      loadedPageCountRef.current = targetPage;
    } catch (failure: any) {
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setComments(prev => handlePageFailure(prev, failure).items);
        setCommentsPagingError(failure?.message || 'More comments could not load.');
      }
    } finally {
      writeLock.current.release(ticket);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setCommentsPaging(false);
      }
    }
  };

  const reactPost = async (reactionType = 'LIKE') => {
    if (!user || !post?.can_interact) return;
    const op = beginOperation(writeLock.current, latestScopeRef.current);
    if (!op) return;
    const { ticket, snapshot } = op;
    setBusy(true); setActionError('');
    let ack = false;
    try {
      await chemistTaskerApi.publicContent.reactToCommunityPost(id, reactionType);
      ack = true;
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      const refreshedPost = await chemistTaskerApi.publicContent.getPost(id);
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      setPost(refreshedPost);
      setRefreshFailed(false);
    } catch (failure: any) {
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        if (ack) {
          setRefreshFailed(true);
          setActionError('Reaction updated, but refresh failed. Reload comments.');
        } else {
          setActionError(failure?.message || 'Could not react to post.');
        }
      }
    } finally {
      writeLock.current.release(ticket);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setBusy(false);
      }
    }
  };

  const removePostReaction = async () => {
    if (!user || !post?.can_interact) return;
    const op = beginOperation(writeLock.current, latestScopeRef.current);
    if (!op) return;
    const { ticket, snapshot } = op;
    setBusy(true); setActionError('');
    let ack = false;
    try {
      await chemistTaskerApi.publicContent.removeCommunityPostReaction(id);
      ack = true;
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      const refreshedPost = await chemistTaskerApi.publicContent.getPost(id);
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      setPost(refreshedPost);
      setRefreshFailed(false);
    } catch (failure: any) {
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        if (ack) {
          setRefreshFailed(true);
          setActionError('Reaction updated, but refresh failed. Reload comments.');
        } else {
          setActionError(failure?.message || 'Could not remove reaction.');
        }
      }
    } finally {
      writeLock.current.release(ticket);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setBusy(false);
      }
    }
  };

  const reactComment = async (commentId: number, reactionType = 'LIKE') => {
    if (!user || !post?.can_interact) return;
    const op = beginOperation(writeLock.current, latestScopeRef.current);
    if (!op) return;
    const { ticket, snapshot } = op;
    setBusy(true); setActionError('');
    let ack = false;
    try {
      await chemistTaskerApi.publicContent.reactToCommunityComment(id, commentId, reactionType);
      ack = true;
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      await refreshAfterMutation(snapshot);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) setRefreshFailed(false);
    } catch (failure: any) {
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        if (ack) {
          setRefreshFailed(true);
          setActionError('Reaction updated, but refresh failed. Reload comments.');
        } else {
          setActionError(failure?.message || 'Could not react to comment.');
        }
      }
    } finally {
      writeLock.current.release(ticket);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setBusy(false);
      }
    }
  };

  const removeCommentReaction = async (commentId: number) => {
    if (!user || !post?.can_interact) return;
    const op = beginOperation(writeLock.current, latestScopeRef.current);
    if (!op) return;
    const { ticket, snapshot } = op;
    setBusy(true); setActionError('');
    let ack = false;
    try {
      await chemistTaskerApi.publicContent.removeCommunityCommentReaction(id, commentId);
      ack = true;
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      await refreshAfterMutation(snapshot);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) setRefreshFailed(false);
    } catch (failure: any) {
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        if (ack) {
          setRefreshFailed(true);
          setActionError('Reaction updated, but refresh failed. Reload comments.');
        } else {
          setActionError(failure?.message || 'Could not remove reaction.');
        }
      }
    } finally {
      writeLock.current.release(ticket);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setBusy(false);
      }
    }
  };

  const sendComment = async () => {
    if (!post?.can_interact || !post.allow_comments || !user || !comment.trim()) return;
    const op = beginOperation(writeLock.current, latestScopeRef.current);
    if (!op) return;
    const { ticket, snapshot } = op;
    setBusy(true); setActionError('');
    let ack = false;
    try {
      const data = { body: comment.trim(), ...(reply ? { parent_comment: reply } : {}) };
      await chemistTaskerApi.publicContent.createCommunityComment(id, data);
      ack = true;
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      setComment(''); setReply(null);
      await refreshAfterMutation(snapshot);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) setRefreshFailed(false);
    } catch (failure: any) {
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        if (ack) {
          setRefreshFailed(true);
          setActionError('Comment posted, but refresh failed. Reload comments.');
        } else {
          setActionError(failure?.message || 'Could not post comment.');
        }
      }
    } finally {
      writeLock.current.release(ticket);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setBusy(false);
      }
    }
  };

  const removeComment = async (row: PublicHubComment) => {
    if (!row.can_edit || !user) return;
    const op = beginOperation(writeLock.current, latestScopeRef.current);
    if (!op) return;
    const { ticket, snapshot } = op;
    setBusy(true); setActionError('');
    let ack = false;
    try {
      await chemistTaskerApi.publicContent.deleteCommunityComment(id, row.id);
      ack = true;
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      await refreshAfterMutation(snapshot);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) setRefreshFailed(false);
    } catch (failure: any) {
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        if (ack) {
          setRefreshFailed(true);
          setActionError('Comment deleted, but refresh failed. Reload comments.');
        } else {
          setActionError(failure?.message || 'Could not delete comment.');
        }
      }
    } finally {
      writeLock.current.release(ticket);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setBusy(false);
      }
    }
  };

  const saveEdit = async () => {
    if (editing === null || !editBody.trim()) return;
    const op = beginOperation(writeLock.current, latestScopeRef.current);
    if (!op) return;
    const { ticket, snapshot } = op;
    setBusy(true); setActionError('');
    let ack = false;
    try {
      if (editing === 'post') {
        const updated = await chemistTaskerApi.publicContent.updateCommunityPost(id, { body: editBody.trim() }) as PublicHubPost;
        if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
        setPost(p => p ? { ...p, body: updated?.body || editBody.trim() } : null);
        setEditing(null);
        setEditBody('');
      } else {
        await chemistTaskerApi.publicContent.updateCommunityComment(id, editing, { body: editBody.trim() });
        ack = true;
        if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
        setEditing(null);
        setEditBody('');
        await refreshAfterMutation(snapshot);
      }
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      setRefreshFailed(false);
    } catch (failure: any) {
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        if (ack) {
          setRefreshFailed(true);
          setActionError('Edit saved, but refresh failed. Reload comments.');
        } else {
          setActionError(failure?.message || 'Could not save edit.');
        }
      }
    } finally {
      writeLock.current.release(ticket);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setBusy(false);
      }
    }
  };

  const deletePost = async () => {
    if (!user || !post?.can_edit) return;
    const op = beginOperation(writeLock.current, latestScopeRef.current);
    if (!op) return;
    const { ticket, snapshot } = op;
    setBusy(true); setActionError('');
    try {
      await chemistTaskerApi.publicContent.deleteCommunityPost(id);
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      router.replace(('/explore/hubs/' + encodeURIComponent(post.platform_hub)) as any);
    } catch (failure: any) {
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setActionError(failure?.message || 'Could not delete post.');
      }
    } finally {
      writeLock.current.release(ticket);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setBusy(false);
      }
    }
  };

  const submitReport = async () => {
    if (!user || !reportReason.trim()) return;
    const op = beginOperation(writeLock.current, latestScopeRef.current);
    if (!op) return;
    const { ticket, snapshot } = op;
    setBusy(true); setActionError('');
    try {
      await chemistTaskerApi.publicContent.reportPost(id, { reason: reportReason.trim() });
      if (!isScopeCurrent(latestScopeRef.current, snapshot)) return;
      setReporting(false);
      setReportReason('');
    } catch (failure: any) {
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setActionError(failure?.message || 'Could not submit report.');
      }
    } finally {
      writeLock.current.release(ticket);
      if (isScopeCurrent(latestScopeRef.current, snapshot)) {
        setBusy(false);
      }
    }
  };

  return <SafeAreaView style={styles.page} edges={['top','left','right','bottom']}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Button mode="text" icon="arrow-left" onPress={() => router.canGoBack() ? router.back() : router.replace('/explore/hubs' as any)}>Community</Button>
      {loading ? <ActivityIndicator /> : error ? <View style={styles.block}>
        <Text accessibilityRole="alert" style={styles.error}>{error}</Text><Button onPress={() => void load()}>Retry</Button>
      </View> : post ? <>
        <Text variant="headlineSmall" style={styles.title}>{post.editorial?.title || 'Community discussion'}</Text>
        <Text style={styles.muted}>{post.author_name}</Text>
        <Card mode="outlined" style={styles.card}><Card.Content style={styles.block}>
          {post.editorial?.body_document ? <RichContent document={post.editorial.body_document} fallback={post.body} /> : <Text style={styles.body}>{post.body}</Text>}
          {post.attachments.map(file => {
            const link = safePublicUrl(file.url, true);
            return link ? <Button key={file.id} mode="outlined" icon="file-outline" onPress={() => void Linking.openURL(link).catch(() => setActionError('Attachment could not open.'))}>{file.name || 'View attachment'}</Button> : null;
          })}
          <View style={styles.actions}>
            {user && post.can_interact ? <>
              <Button mode="outlined" disabled={busy} onPress={() => void reactPost('LIKE')}>Like</Button>
              <Button mode="outlined" disabled={busy} onPress={() => void removePostReaction()}>Remove reaction</Button>
            </> : user ? <Text style={styles.muted}>Reactions require an eligible community membership.</Text> : <Button mode="outlined" onPress={signIn}>Sign in to react</Button>}
            <Button mode="outlined" onPress={() => void Share.share({ message: publicWebUrl('/hubs/posts/' + id) }).catch(() => setActionError('Sharing unavailable.'))}>Share</Button>
          </View>
          {user && post.can_edit ? <View style={styles.block}>
            <Button mode="outlined" onPress={() => { setEditing('post'); setEditBody(post.body); }}>Edit my post</Button>
            <Button mode="outlined" disabled={busy} onPress={() => void deletePost()}>Delete my post</Button>
          </View> : null}
        </Card.Content></Card>
        {editing !== null ? <Card mode="outlined" style={styles.card}><Card.Content style={styles.block}>
          <TextInput mode="outlined" label="Edit text" multiline value={editBody} onChangeText={setEditBody} />
          <Button mode="contained" disabled={busy || !editBody.trim()} onPress={() => void saveEdit()}>Save change</Button>
          <Button mode="text" onPress={() => setEditing(null)}>Cancel edit</Button>
        </Card.Content></Card> : null}
        <Text variant="titleLarge" style={styles.title}>Comments</Text>
        {comments.length ? comments.map(row => <Card key={row.id} mode="outlined" style={styles.card}><Card.Content style={styles.block}>
          <Text variant="titleSmall">{row.author_name}</Text><Text style={styles.body}>{row.body}</Text>
          {user && post.can_interact ? <View style={styles.actions}>
            {post.allow_comments ? <Button onPress={() => setReply(row.parent_comment || row.id)}>Reply</Button> : null}
            <Button disabled={busy} onPress={() => void reactComment(row.id)}>{row.reactions?.LIKE ? `Like · ${row.reactions.LIKE}` : 'Like'}</Button>
            <Button disabled={busy} onPress={() => void removeCommentReaction(row.id)}>Remove reaction</Button>
            {row.can_edit ? <>
              <Button onPress={() => { setEditing(row.id); setEditBody(row.body); }}>Edit</Button>
              <Button disabled={busy} onPress={() => void removeComment(row)}>Delete</Button>
            </> : null}
          </View> : null}
        </Card.Content></Card>) : <Text style={styles.muted}>No comments yet.</Text>}
        {commentsNextPage !== null ? <Button mode="outlined" disabled={busy} loading={commentsPaging} onPress={() => void loadMoreComments()}>Load more comments</Button> : null}
        {commentsPagingError ? <View style={styles.block}><Text accessibilityRole="alert" style={styles.error}>{commentsPagingError}</Text><Button mode="text" disabled={busy} onPress={() => void loadMoreComments()}>Retry loading comments</Button></View> : null}
        {!post.allow_comments ? <Text style={styles.muted}>Comments are closed.</Text> :
          user && post.can_interact ? <Card mode="outlined" style={styles.card}><Card.Content style={styles.block}>
            {reply ? <Button onPress={() => setReply(null)}>Replying to comment — cancel</Button> : null}
            <TextInput mode="outlined" label={reply ? 'Write reply' : 'Write a comment'} multiline maxLength={4000} value={comment} onChangeText={setComment} />
            <Button mode="contained" disabled={busy || !comment.trim()} onPress={() => void sendComment()}>Post comment</Button>
          </Card.Content></Card> : !user ? <Button mode="outlined" onPress={signIn}>Sign in to comment</Button> : null}
        <Button mode="text" disabled={busy} onPress={() => setReporting(!reporting)}>Report this post</Button>
        {reporting ? <View style={styles.block}>
          <TextInput label="Reason for report" multiline value={reportReason} maxLength={500} onChangeText={setReportReason} />
          <Button disabled={busy || !reportReason.trim() || !user} onPress={() => void submitReport()}>Submit report</Button>
          {!user ? <Button onPress={signIn}>Sign in to report</Button> : null}
        </View> : null}
        {actionError ? <View style={styles.block}>
          <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text>
          {refreshFailed ? <Button mode="text" disabled={busy} onPress={() => void retryRefresh()}>Reload comments</Button> : null}
        </View> : null}
      </> : <Text>No post found.</Text>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, paddingBottom: space['3xl'], gap: space.lg },
  title: { color: colors.textPrimary, fontWeight: '700' },
  muted: { color: colors.textSecondary, lineHeight: 21 },
  body: { color: colors.textPrimary, lineHeight: 24, fontSize: 16 },
  card: { borderColor: colors.border, backgroundColor: colors.surfaceBg, borderRadius: radius.card },
  block: { gap: space.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, minHeight: touch.min },
  error: { color: colors.status.red.fg },
});
