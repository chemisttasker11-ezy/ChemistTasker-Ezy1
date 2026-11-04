import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Button, Card, Text, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PublicHubComment, PublicHubPost } from '@chemisttasker/shared-core';
import { chemistTaskerApi } from '@/config/api';
import { useAuth } from '@/context/AuthContext';
import { RichContent } from '@/features/explore/RichContent';
import { publicWebUrl, safePublicUrl } from '@/features/explore/webLinks';
import { colors, radius, space, touch } from '@/constants/tokens';

export default function PublicHubPostDetail() {
  const router = useRouter();
  const { user } = useAuth();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const requestRef = useRef(0);
  const [post, setPost] = useState<PublicHubPost | null>(null);
  const [comments, setComments] = useState<PublicHubComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
    setLoading(true); setError(''); setActionError('');
    setPost(null); setComments([]);
    try {
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid post link.');
      const [current, replies] = await Promise.all([
        chemistTaskerApi.publicContent.getPost(id),
        chemistTaskerApi.publicContent.listPostComments(id),
      ]);
      if (ticket !== requestRef.current) return;
      setPost(current); setComments(replies.results || []);
    } catch (failure: any) {
      if (ticket === requestRef.current) setError(failure?.message || 'Post could not load.');
    } finally { if (ticket === requestRef.current) setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); return () => { requestRef.current += 1; }; }, [load]);

  const signIn = () => router.push({ pathname: '/login', params: { returnTo: '/explore/hubs/post/' + id } } as any);
  const act = async (perform: () => Promise<unknown>, reload = true) => {
    if (busy) return;
    const ticket = requestRef.current;
    setBusy(true); setActionError('');
    try {
      await perform();
      if (ticket === requestRef.current && reload) { setBusy(false); await load(); }
    } catch (failure: any) {
      if (ticket === requestRef.current) setActionError(failure?.message || 'This action failed. Please retry.');
    } finally { if (ticket === requestRef.current) setBusy(false); }
  };
  const sendComment = () => {
    if (!post?.can_interact || !post.allow_comments || !user || !comment.trim()) return;
    const data = { body: comment.trim(), ...(reply ? { parent_comment: reply } : {}) };
    void act(async () => {
      await chemistTaskerApi.publicContent.createCommunityComment(id, data);
      setComment(''); setReply(null);
    });
  };
  const removeComment = (row: PublicHubComment) => {
    if (!row.can_edit || !user) return;
    void act(() => chemistTaskerApi.publicContent.deleteCommunityComment(id, row.id));
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
              <Button mode="outlined" disabled={busy} onPress={() => void act(() => chemistTaskerApi.publicContent.reactToCommunityPost(id, 'LIKE'))}>Like</Button>
              <Button mode="outlined" disabled={busy} onPress={() => void act(() => chemistTaskerApi.publicContent.removeCommunityPostReaction(id))}>Remove reaction</Button>
            </> : user ? <Text style={styles.muted}>Reactions require an eligible community membership.</Text> : <Button mode="outlined" onPress={signIn}>Sign in to react</Button>}
            <Button mode="outlined" onPress={() => void Share.share({ message: publicWebUrl('/hubs/posts/' + id) }).catch(() => setActionError('Sharing unavailable.'))}>Share</Button>
          </View>
          {user && post.can_edit ? <View style={styles.block}>
            <Button mode="outlined" onPress={() => { setEditing('post'); setEditBody(post.body); }}>Edit my post</Button>
            <Button mode="outlined" disabled={busy} onPress={() => void act(async () => { await chemistTaskerApi.publicContent.deleteCommunityPost(id); router.replace(('/explore/hubs/' + encodeURIComponent(post.platform_hub)) as any); }, false)}>Delete my post</Button>
          </View> : null}
        </Card.Content></Card>
        {editing !== null ? <Card mode="outlined" style={styles.card}><Card.Content style={styles.block}>
          <TextInput mode="outlined" label="Edit text" multiline value={editBody} onChangeText={setEditBody} />
          <Button mode="contained" disabled={busy || !editBody.trim()} onPress={() => void act(() => editing === 'post'
            ? chemistTaskerApi.publicContent.updateCommunityPost(id, { body: editBody.trim() })
            : chemistTaskerApi.publicContent.updateCommunityComment(id, editing as number, { body: editBody.trim() }))}>Save change</Button>
          <Button mode="text" onPress={() => setEditing(null)}>Cancel edit</Button>
        </Card.Content></Card> : null}
        <Text variant="titleLarge" style={styles.title}>Comments</Text>
        {comments.length ? comments.map(row => <Card key={row.id} mode="outlined" style={styles.card}><Card.Content style={styles.block}>
          <Text variant="titleSmall">{row.author_name}</Text><Text style={styles.body}>{row.body}</Text>
          {user && post.can_interact ? <View style={styles.actions}>
            {post.allow_comments ? <Button onPress={() => setReply(row.parent_comment || row.id)}>Reply</Button> : null}
            <Button disabled={busy} onPress={() => void act(() => chemistTaskerApi.publicContent.reactToCommunityComment(id, row.id, 'LIKE'))}>Like</Button>
            {row.can_edit ? <>
              <Button onPress={() => { setEditing(row.id); setEditBody(row.body); }}>Edit</Button>
              <Button disabled={busy} onPress={() => removeComment(row)}>Delete</Button>
            </> : null}
          </View> : null}
        </Card.Content></Card>) : <Text style={styles.muted}>No comments yet.</Text>}
        {!post.allow_comments ? <Text style={styles.muted}>Comments are closed.</Text> :
          user && post.can_interact ? <Card mode="outlined" style={styles.card}><Card.Content style={styles.block}>
            {reply ? <Button onPress={() => setReply(null)}>Replying to comment — cancel</Button> : null}
            <TextInput mode="outlined" label={reply ? 'Write reply' : 'Write a comment'} multiline maxLength={4000} value={comment} onChangeText={setComment} />
            <Button mode="contained" disabled={busy || !comment.trim()} onPress={sendComment}>Post comment</Button>
          </Card.Content></Card> : !user ? <Button mode="outlined" onPress={signIn}>Sign in to comment</Button> : null}
        <Button mode="text" disabled={busy} onPress={() => setReporting(!reporting)}>Report this post</Button>
        {reporting ? <View style={styles.block}>
          <TextInput label="Reason for report" multiline value={reportReason} maxLength={500} onChangeText={setReportReason} />
          <Button disabled={busy || !reportReason.trim() || !user} onPress={() => void act(() => chemistTaskerApi.publicContent.reportPost(id, { reason: reportReason.trim() }), false)}>Submit report</Button>
          {!user ? <Button onPress={signIn}>Sign in to report</Button> : null}
        </View> : null}
        {actionError ? <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text> : null}
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
