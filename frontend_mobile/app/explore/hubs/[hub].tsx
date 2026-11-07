import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { BrandActivityIndicator as ActivityIndicator } from '@/components/ui/BrandActivityIndicator';
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
  const { user } = useAuth();
  return <PublicHubFeedView key={String(user?.id ?? 'anonymous')} />;
}

function PublicHubFeedView() {
  const router = useRouter();
  const { user } = useAuth();
  const accountKey = String(user?.id ?? 'anonymous');
  const { hub: routeHub } = useLocalSearchParams<{ hub: string }>();
  const hub = String(routeHub || '');
  const loadedHub = useRef(hub);
  const generation = useRef(0);
  const postGeneration = useRef(0);
  const postPaging = useRef(false);
  const searching = useRef(false);
  const currentQuery = useRef('');
  const pollPaging = useRef(false);
  const submitting = useRef(false);
  const [info, setInfo] = useState<PublicHubSummary | null>(null);
  const [posts, setPosts] = useState<PublicHubPost[]>([]);
  const [polls, setPolls] = useState<PublicHubPoll[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [pollNext, setPollNext] = useState<number | null>(null);
  // Synchronous current page count for vote refreshes racing with pagination.
  const pollPagesRef = useRef(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const [pollMoreBusy, setPollMoreBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');
  const [pollMoreError, setPollMoreError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [actionError, setActionError] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<DocumentPicker.DocumentPickerAsset[]>([]);

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    const postTicket = ++postGeneration.current;
    if (loadedHub.current !== hub) {
      loadedHub.current = hub;
      submitting.current = false; setBody(''); setAttachments([]);
    }
    postPaging.current = false; pollPaging.current = false; searching.current = false; currentQuery.current = '';
    setLoading(true); setBusy(false); setError(''); setActionError(''); setMoreError('');
    setPollMoreError(''); setSearchError(''); setSearchDraft(''); setSearchTerm('');
    setPosts([]); setPolls([]); setInfo(null); setNext(null); setPollNext(null);
    pollPagesRef.current = 1; setMoreBusy(false); setPollMoreBusy(false); setSearchBusy(false);
    try {
      const [hubs, result, pollResult] = await Promise.all([
        chemistTaskerApi.publicContent.listHubs(),
        chemistTaskerApi.publicContent.listCommunityPosts(hub, { page: 1 }),
        chemistTaskerApi.publicContent.listCommunityPolls(hub, { page: 1 }),
      ]);
      if (ticket !== generation.current) return;
      setInfo(hubs.find(h => h.key === hub) || null);
      if (postTicket === postGeneration.current) {
        setPosts(result.results || []);
        setNext(nextPage(result.next));
      }
      setPolls(pollResult.results || []);
      setPollNext(nextPage(pollResult.next));
    } catch (failure: any) {
      if (ticket === generation.current) setError(failure?.message || 'Public community could not load.');
    } finally { if (ticket === generation.current) setLoading(false); }
  }, [hub, accountKey]);
  useEffect(() => {
    let active = true;
    // Defer initial load until after effects subscribe; stale generations cannot overwrite state.
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; generation.current += 1; postGeneration.current += 1; };
  }, [load]);

  // Search is posts-only; changing the query must not reset the independent poll feed.
  const searchPosts = async (raw: string) => {
    const q = raw.trim().slice(0, 200);
    const ticket = generation.current;
    const postTicket = ++postGeneration.current;
    searching.current = true;
    postPaging.current = false;
    setMoreBusy(false);
    setSearchBusy(true); setSearchError(''); setMoreError('');
    try {
      const result = await chemistTaskerApi.publicContent.listCommunityPosts(hub, { page: 1, ...(q ? { q } : {}) });
      if (ticket !== generation.current || postTicket !== postGeneration.current) return;
      currentQuery.current = q;
      setSearchTerm(q);
      setPosts(result.results || []);
      setNext(nextPage(result.next));
    } catch (failure: any) {
      if (ticket === generation.current && postTicket === postGeneration.current)
        setSearchError(failure?.message || 'Search could not load. Try again.');
    } finally {
      if (ticket === generation.current && postTicket === postGeneration.current) { searching.current = false; setSearchBusy(false); }
    }
  };
  const loadMore = async () => {
    if (next === null || postPaging.current || searching.current || searchTerm !== currentQuery.current) return;
    const ticket = generation.current;
    const postTicket = postGeneration.current;
    const query = currentQuery.current;
    postPaging.current = true;
    setMoreBusy(true); setMoreError('');
    try {
      const page = await chemistTaskerApi.publicContent.listCommunityPosts(hub, { page: next, ...(query ? { q: query } : {}) });
      if (ticket !== generation.current || postTicket !== postGeneration.current || query !== currentQuery.current) return;
      setPosts(existing => {
        const ids = new Map(existing.map(post => [post.id, post]));
        for (const item of page.results || []) ids.set(item.id, item);
        return Array.from(ids.values());
      });
      setNext(nextPage(page.next));
    } catch (failure: any) {
      if (ticket === generation.current && postTicket === postGeneration.current)
        setMoreError(failure?.message || 'More posts could not load.');
    } finally {
      if (ticket === generation.current && postTicket === postGeneration.current) {
        postPaging.current = false;
        setMoreBusy(false);
      }
    }
  };
  const loadMorePolls = async () => {
    if (pollNext === null || pollPaging.current) return;
    const ticket = generation.current;
    const requested = pollNext;
    pollPaging.current = true;
    setPollMoreBusy(true); setPollMoreError('');
    try {
      const result = await chemistTaskerApi.publicContent.listCommunityPolls(hub, { page: requested });
      if (ticket !== generation.current) return;
      setPolls(existing => {
        const merged = new Map(existing.map(p => [p.id, p]));
        for (const item of result.results || []) merged.set(item.id, item);
        return Array.from(merged.values());
      });
      setPollNext(nextPage(result.next));
      pollPagesRef.current = requested;
    } catch (failure: any) {
      if (ticket === generation.current) setPollMoreError(failure?.message || 'More polls could not load.');
    } finally {
      if (ticket === generation.current) {
        pollPaging.current = false;
        setPollMoreBusy(false);
      }
    }
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
    } finally { if (ticket === generation.current) { submitting.current = false; setBusy(false); } }
  };
  const vote = async (poll: PublicHubPoll, optionId: number) => {
    if (!user) return router.push({ pathname: '/login', params: { returnTo: '/explore/hubs/' + encodeURIComponent(hub) } } as any);
    if (!poll.can_interact || poll.is_closed || busy) return;
    const ticket = generation.current;
    setBusy(true); setActionError('');
    try {
      await chemistTaskerApi.publicContent.voteCommunityPoll(poll.id, optionId);
      // Refresh every visible page after a vote, preserving the loaded discussion and
      // previously paginated polls rather than dropping page 2+ to page 1.
      const pagesAtRefresh = pollPagesRef.current;
      const pages = await Promise.all(Array.from({ length: pagesAtRefresh }, (_, index) =>
        chemistTaskerApi.publicContent.listCommunityPolls(hub, { page: index + 1 })));
      // If page 2+ arrived while the refresh ran, its newer feed wins.
      if (ticket === generation.current && pollPagesRef.current === pagesAtRefresh) {
        const merged = new Map<number, PublicHubPoll>();
        for (const response of pages) {
          for (const item of response.results || []) merged.set(item.id, item);
        }
        setPolls(Array.from(merged.values()));
        setPollNext(nextPage(pages.at(-1)?.next ?? null));
      }
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
          <View style={styles.search}>
            <TextInput mode="outlined" label="Search community posts" value={searchDraft}
              onChangeText={setSearchDraft} maxLength={200} disabled={searchBusy}
              onSubmitEditing={() => void searchPosts(searchDraft)} />
            <Button mode="outlined" disabled={searchBusy} onPress={() => void searchPosts(searchDraft)}>Search</Button>
            {searchTerm || searchDraft ? <Button mode="text" disabled={searchBusy}
              onPress={() => { setSearchDraft(''); void searchPosts(''); }}>Clear search</Button> : null}
            {searchError ? <Text accessibilityRole="alert" style={styles.error}>{searchError}</Text> : null}
            {searchTerm ? <Text style={styles.muted}>Posts matching “{searchTerm}”</Text> : null}
          </View>
          {polls.map(poll => <Card key={poll.id} mode="outlined" style={styles.card}><Card.Content style={styles.inner}>
            <Text variant="titleMedium">{poll.question}</Text>
            {poll.options.map(option => <Button key={option.id} mode="outlined"
              disabled={busy || poll.is_closed || !poll.can_interact}
              onPress={() => void vote(poll, option.id)}>{option.text} · {option.votes} votes</Button>)}
            {poll.is_closed ? <Text style={styles.muted}>Voting closed</Text> : null}
          </Card.Content></Card>)}
          {pollNext !== null ? <Button mode="outlined" contentStyle={styles.button}
            disabled={pollMoreBusy} loading={pollMoreBusy} onPress={() => void loadMorePolls()}>Load more polls</Button> : null}
          {pollMoreError ? <View style={styles.status}>
            <Text accessibilityRole="alert" style={styles.error}>{pollMoreError}</Text>
            <Button onPress={() => void loadMorePolls()}>Retry polls</Button>
          </View> : null}
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
          {next !== null ? <Button mode="outlined" contentStyle={styles.button} disabled={moreBusy || searchBusy} loading={moreBusy} onPress={() => void loadMore()}>Load more posts</Button> : null}
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
  search: { gap: space.sm },
  button: { minHeight: touch.min },
});
