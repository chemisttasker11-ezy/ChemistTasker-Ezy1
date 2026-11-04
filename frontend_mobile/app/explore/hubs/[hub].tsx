import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Button, Card, Text, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PublicHubPoll, PublicHubPost, PublicHubSummary } from '@chemisttasker/shared-core';
import { chemistTaskerApi } from '@/config/api';
import { useAuth } from '@/context/AuthContext';
import { RichContent } from '@/features/explore/RichContent';
import { publicWebUrl } from '@/features/explore/webLinks';
import { colors, radius, space, touch } from '@/constants/tokens';

function nextPage(url: string | null): number | null {
  const match = /[?&]page=(\d+)(?:[&#]|$)/.exec(url || '');
  return match && Number(match[1]) > 1 ? Number(match[1]) : null;
}

export default function PublicHubFeed() {
  const router = useRouter();
  const { user } = useAuth();
  const { hub: routeHub } = useLocalSearchParams<{ hub: string }>();
  const hub = String(routeHub || '');
  const generation = useRef(0);
  const submitting = useRef(false);
  const [info, setInfo] = useState<PublicHubSummary | null>(null);
  const [posts, setPosts] = useState<PublicHubPost[]>([]);
  const [polls, setPolls] = useState<PublicHubPoll[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');
  const [actionError, setActionError] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<DocumentPicker.DocumentPickerAsset[]>([]);

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true); setError(''); setActionError(''); setMoreError('');
    setPosts([]); setPolls([]); setInfo(null); setNext(null); setMoreBusy(false);
    try {
      const [hubs, result, pollResult] = await Promise.all([
        chemistTaskerApi.publicContent.listHubs(),
        chemistTaskerApi.publicContent.listCommunityPosts(hub, { page: 1 }),
        chemistTaskerApi.publicContent.listCommunityPolls(hub),
      ]);
      if (ticket !== generation.current) return;
      setInfo(hubs.find(h => h.key === hub) || null);
      setPosts(result.results || []);
      setNext(nextPage(result.next));
      setPolls(pollResult.results || []);
    } catch (failure: any) {
      if (ticket === generation.current) setError(failure?.message || 'Public community could not load.');
    } finally { if (ticket === generation.current) setLoading(false); }
  }, [hub]);
  useEffect(() => { void load(); return () => { generation.current += 1; }; }, [load]);

  const loadMore = async () => {
    if (next === null || moreBusy) return;
    const ticket = generation.current;
    setMoreBusy(true); setMoreError('');
    try {
      const page = await chemistTaskerApi.publicContent.listCommunityPosts(hub, { page: next });
      if (ticket !== generation.current) return;
      setPosts(existing => {
        const ids = new Map(existing.map(post => [post.id, post]));
        for (const item of page.results || []) ids.set(item.id, item);
        return Array.from(ids.values());
      });
      setNext(nextPage(page.next));
    } catch (failure: any) {
      if (ticket === generation.current) setMoreError(failure?.message || 'More posts could not load.');
    } finally { if (ticket === generation.current) setMoreBusy(false); }
  };

  const chooseAttachments = async () => {
    setActionError('');
    try {
      const selection = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: '*/*' });
      if (selection.canceled) return;
      const large = selection.assets.find(asset => asset.size != null && asset.size > 15 * 1024 * 1024);
      if (large) { setActionError(`${large.name} exceeds the 15 MB per-file limit.`); return; }
      setAttachments(existing => [...existing, ...selection.assets].slice(0, 8));
    } catch (failure: any) { setActionError(failure?.message || 'Unable to select attachments.'); }
  };
  const create = async () => {
    if (!user || !info?.can_interact || submitting.current || !body.trim()) return;
    const ticket = generation.current;
    submitting.current = true; setBusy(true); setActionError('');
    try {
      const request = new FormData();
      request.append('scope', 'platform');
      request.append('platform_hub', hub);
      request.append('body', body.trim());
      for (const asset of attachments) {
        if (asset.size != null && asset.size > 15 * 1024 * 1024) throw new Error('Attachment is too large (15 MB maximum).');
        request.append('attachments', { uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/octet-stream' } as any);
      }
      await chemistTaskerApi.publicContent.createCommunityPost(request);
      if (ticket === generation.current) { setBody(''); setAttachments([]); setBusy(false); submitting.current = false; await load(); }
    } catch (failure: any) {
      if (ticket === generation.current) setActionError(failure?.message || 'Post could not be published. Your draft is retained.');
    } finally { submitting.current = false; if (ticket === generation.current) setBusy(false); }
  };
  const vote = async (poll: PublicHubPoll, optionId: number) => {
    if (!user) return router.push({ pathname: '/login', params: { returnTo: '/explore/hubs/' + encodeURIComponent(hub) } } as any);
    if (!poll.can_interact || poll.is_closed || busy) return;
    const ticket = generation.current;
    setBusy(true); setActionError('');
    try {
      await chemistTaskerApi.publicContent.voteCommunityPoll(poll.id, optionId);
      const response = await chemistTaskerApi.publicContent.listCommunityPolls(hub);
      if (ticket === generation.current) setPolls(response.results || []);
    } catch (failure: any) {
      if (ticket === generation.current) setActionError(failure?.message || 'Vote failed.');
    } finally { if (ticket === generation.current) setBusy(false); }
  };

  return <SafeAreaView style={styles.page} edges={['top', 'left', 'right', 'bottom']}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Button mode="text" icon="arrow-left" onPress={() => router.canGoBack() ? router.back() : router.replace('/explore/hubs' as any)}>Communities</Button>
      <Text variant="headlineMedium" style={styles.title}>{info?.label || 'Community'}</Text>
      {loading ? <ActivityIndicator /> : error ?
        <View style={styles.status}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Button onPress={() => void load()}>Retry</Button></View> : <>
          {!user ? <Button mode="outlined" onPress={() => router.push({ pathname: '/login', params: { returnTo: '/explore/hubs/' + encodeURIComponent(hub) } } as any)}>Sign in to participate</Button> : null}
          {info?.can_interact && user ? <Card mode="outlined" style={styles.card}><Card.Content style={styles.inner}>
            <Text variant="titleMedium">Share an update</Text>
            <TextInput mode="outlined" multiline label="Post to this community" maxLength={4000} value={body} onChangeText={setBody} disabled={busy} />
            <Button mode="outlined" icon="paperclip" disabled={busy} onPress={() => void chooseAttachments()}>Attach files (15 MB each)</Button>
            {attachments.map((file, index) => <Button key={file.uri + '-' + index} mode="text" disabled={busy} onPress={() => setAttachments(existing => existing.filter((_, i) => i !== index))}>{file.name} · remove</Button>)}
            <Button mode="contained" disabled={busy || !body.trim()} loading={busy} onPress={() => void create()}>Post</Button>
          </Card.Content></Card> : <Text style={styles.muted}>This community is readable publicly. Posting is available to eligible members.</Text>}
          {polls.map(poll => <Card key={poll.id} mode="outlined" style={styles.card}><Card.Content style={styles.inner}>
            <Text variant="titleMedium">{poll.question}</Text>
            {poll.options.map(option => <Button key={option.id} mode="outlined"
              disabled={busy || poll.is_closed || !poll.can_interact}
              onPress={() => void vote(poll, option.id)}>{option.text} · {option.votes} votes</Button>)}
            {poll.is_closed ? <Text style={styles.muted}>Voting closed</Text> : null}
          </Card.Content></Card>)}
          {posts.length === 0 ? <Text style={styles.muted}>No community posts yet.</Text> : posts.map(post => <Card key={post.id} mode="outlined" style={styles.card}
            onPress={() => router.push({ pathname: '/explore/hubs/post/[id]', params: { id: String(post.id) } } as any)}>
            <Card.Content style={styles.inner}>
              {post.is_pinned ? <Text style={styles.pinned}>PINNED</Text> : null}
              {post.editorial?.title ? <Text variant="titleMedium">{post.editorial.title}</Text> : null}
              <Text variant="titleSmall">{post.author_name}</Text>
              {post.editorial?.body_document ? <RichContent document={post.editorial.body_document} fallback={post.body} /> : <Text style={styles.muted} numberOfLines={5}>{post.body}</Text>}
              <Text style={styles.pinned}>{post.comment_count} comments · {Object.values(post.reactions).reduce((total, count) => total + count, 0)} reactions</Text>
              <Button mode="text" onPress={() => router.push({ pathname: '/explore/hubs/post/[id]', params: { id: String(post.id) } } as any)}>Read conversation</Button>
            </Card.Content>
          </Card>)}
          {next !== null ? <Button mode="outlined" contentStyle={styles.button} disabled={moreBusy} loading={moreBusy} onPress={() => void loadMore()}>Load more posts</Button> : null}
          {moreError ? <Text accessibilityRole="alert" style={styles.error}>{moreError}</Text> : null}
          {actionError ? <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text> : null}
          <Button mode="text" icon="share-variant" onPress={() => void Share.share({ message: publicWebUrl('/hubs/' + encodeURIComponent(hub)) }).catch(() => setActionError('Sharing unavailable.'))}>Share community</Button>
        </>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, paddingBottom: space['3xl'], gap: space.md },
  title: { color: colors.textPrimary, fontWeight: '700' },
  card: { borderColor: colors.border, borderRadius: radius.card, backgroundColor: colors.surfaceBg },
  inner: { gap: space.sm },
  muted: { color: colors.textSecondary, lineHeight: 22 },
  pinned: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  error: { color: colors.status.red.fg },
  status: { gap: space.md },
  button: { minHeight: touch.min },
});
