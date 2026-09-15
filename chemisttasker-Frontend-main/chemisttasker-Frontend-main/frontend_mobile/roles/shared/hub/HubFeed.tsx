import React, { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, Animated, FlatList, Image, RefreshControl, View, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { Button, Text, IconButton, Menu, Modal, Portal, TextInput, HelperText, Divider, Chip, Avatar } from 'react-native-paper';
import { fetchHubPosts, fetchHubPolls, createHubComment, createHubPollComment, deleteHubComment, fetchHubComments, fetchHubPollComments, reactToHubComment, reactToHubPoll, removeHubCommentReaction, removeHubPollReaction, voteHubPoll, updateHubComment, updateHubPoll, deleteHubPoll } from './api';
import type { HubPost, HubPoll, HubReactionType } from './types';
import { PostCard } from './PostCard';
import { PostComposer } from './PostComposer';
import { PollComposer } from './PollComposer';
import { formatHubDate, formatMemberLabel, getHubAuthorName, reactionEmojis } from './hubUtils';

type ScopeBase =
  | { type: 'pharmacy'; id: number }
  | { type: 'organization'; id: number }
  | { type: 'group'; id: number }
  | { type: 'orgGroup'; id: number }
  | { type: 'platform'; id: string };

type Scope = ScopeBase | null;

type Props = {
  scope: Scope;
  onBack?: () => void;
  targetPostId?: number | null;
  onTargetPostHandled?: () => void;
  header?: {
    title: string;
    subtitle?: string;
    cover?: string | null;
    canEditProfile?: boolean;
    onEditProfile?: () => void;
    actions?: Array<{
      title: string;
      icon?: string;
      onPress: () => void;
      destructive?: boolean;
    }>;
  };
};

type FeedItem =
  | { kind: 'post'; sortAt: number; item: HubPost }
  | { kind: 'poll'; sortAt: number; item: HubPoll };

function PollCardMobile({
  poll,
  onVote,
  onUpdate,
  onEdit,
  onDelete,
}: {
  poll: HubPoll;
  onVote: (pollId: number, optionId: number) => Promise<void> | void;
  onUpdate: (poll: HubPoll) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [reactionMenuVisible, setReactionMenuVisible] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [comments, setComments] = useState<any[]>(((poll as any).recentComments ?? []));
  const [commentDraft, setCommentDraft] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);

  const author = (poll as any).author || (poll as any).createdBy || {};
  const user = author.user || author.userDetails || author.user_details || {};
  const authorName = getHubAuthorName(user, 'Member');
  const authorLabel = formatMemberLabel(authorName, author.role, null, 'Member');
  const authorAvatar = user.profilePhotoUrl || user.profile_photo_url || null;
  const reactionSummary = (poll as any).reactionSummary || {};
  const reactionEntries = Object.entries(reactionSummary).filter(([, v]) => Number(v) > 0);
  const viewerReaction = (poll as any).viewerReaction as HubReactionType | null | undefined;
  const totalReactions = Object.values(reactionSummary).reduce((sum: number, value: any) => sum + Number(value ?? 0), 0);

  const loadComments = async () => {
    if (commentsLoading) return;
    setCommentsLoading(true);
    setCommentError(null);
    try {
      const data = await fetchHubPollComments(poll.id);
      setComments(data);
    } catch {
      setCommentError('Failed to load comments');
    } finally {
      setCommentsLoading(false);
    }
  };

  return (
    <View style={pollStyles.card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', flex: 1, gap: 10 }}>
          {authorAvatar ? <Avatar.Image size={36} source={{ uri: authorAvatar }} /> : <Avatar.Text size={36} label={authorName.charAt(0) || 'U'} />}
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: '#111827' }}>{authorLabel}</Text>
            <Text style={{ color: '#6B7280', fontSize: 12 }}>{formatHubDate(poll.createdAt)}</Text>
            <Text style={[pollStyles.question, { marginTop: 6 }]}>{poll.question}</Text>
          </View>
        </View>
        {poll.canManage ? (
          <Menu
            visible={menuVisible}
            onDismiss={() => setMenuVisible(false)}
            anchor={<IconButton icon="dots-vertical" size={20} onPress={() => setMenuVisible(true)} />}
          >
            {onEdit ? <Menu.Item onPress={() => { setMenuVisible(false); onEdit(); }} title="Edit" /> : null}
            {onDelete ? <Menu.Item onPress={() => { setMenuVisible(false); onDelete(); }} title="Delete" /> : null}
          </Menu>
        ) : null}
      </View>
      {poll.options
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((opt) => {
          const isSelected = poll.selectedOptionId === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[pollStyles.option, isSelected ? pollStyles.optionSelected : null]}
              disabled={!poll.canVote}
              onPress={() => onVote(poll.id, opt.id)}
            >
              <Text style={pollStyles.optionLabel}>{opt.label}</Text>
              <Text style={pollStyles.optionMeta}>{opt.percentage ?? 0}% • {opt.voteCount} votes</Text>
            </TouchableOpacity>
          );
        })}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Menu
            visible={reactionMenuVisible}
            onDismiss={() => setReactionMenuVisible(false)}
            anchor={
              <Button compact onPress={() => setReactionMenuVisible(true)}>
                {totalReactions ? `${totalReactions}` : viewerReaction ? (reactionEmojis[viewerReaction] || 'React') : 'React'}
              </Button>
            }
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4, gap: 10 }}>
                {Object.keys(reactionEmojis).map((key) => (
                <TouchableOpacity
                  key={key}
                  onPress={async () => {
                    setReactionMenuVisible(false);
                    try {
                      const updated = await reactToHubPoll(poll.id, key as HubReactionType);
                      onUpdate(updated);
                    } catch {
                      setCommentError('Failed to react');
                    }
                  }}
                  style={{ padding: 6 }}
                >
                  <Text style={{ fontSize: 16 }}>{reactionEmojis[key as keyof typeof reactionEmojis] || ''}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {viewerReaction ? <Menu.Item onPress={async () => {
              setReactionMenuVisible(false);
              try {
                const updated = await removeHubPollReaction(poll.id);
                onUpdate(updated);
              } catch {
                setCommentError('Failed to remove reaction');
              }
            }} title="Remove reaction" /> : null}
          </Menu>
          <Button compact onPress={async () => { const next = !commentsOpen; setCommentsOpen(next); if (next) await loadComments(); }}>
            Comment{(poll as any).commentCount ? ` (${(poll as any).commentCount})` : ''}
          </Button>
          <Text style={{ color: '#6B7280', fontSize: 12 }}>{poll.totalVotes} votes</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {reactionEntries.map(([reaction, count]) => (
            <Chip key={reaction} compact>{`${reactionEmojis[reaction as keyof typeof reactionEmojis] || ''} ${count}`}</Chip>
          ))}
          {poll.hasVoted ? <Chip compact>You voted</Chip> : null}
        </View>
      </View>
      {commentsOpen ? (
        <View style={{ marginTop: 12, gap: 8 }}>
          {commentsLoading ? (
            <ActivityIndicator />
          ) : comments.length ? (
            comments.map((comment: any) => {
              const commentAuthor = comment.author || {};
              const commentUser = commentAuthor.user || commentAuthor.userDetails || commentAuthor.user_details || {};
              const commentName = getHubAuthorName(commentUser, 'Member');
              return (
                <View key={comment.id} style={{ paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' }}>
                  <Text style={{ fontWeight: '600', color: '#111827' }}>
                    {formatMemberLabel(commentName, commentAuthor.role, null, 'Member')}
                  </Text>
                  <Text style={{ color: '#6B7280', fontSize: 12 }}>{formatHubDate(comment.createdAt || comment.created_at)}</Text>
                  <Text style={{ color: '#111827', marginTop: 4 }}>{comment.body}</Text>
                </View>
              );
            })
          ) : (
            <Text style={{ color: '#6B7280' }}>No comments yet.</Text>
          )}
          <TextInput mode="outlined" label="Add a comment" value={commentDraft} onChangeText={setCommentDraft} multiline />
          {commentError ? <HelperText type="error">{commentError}</HelperText> : null}
          <Button mode="contained" onPress={async () => {
            if (!commentDraft.trim()) return;
            try {
              const created = await createHubPollComment(poll.id, { body: commentDraft.trim() } as any);
              setComments((prev) => [...prev, created]);
              setCommentDraft('');
              onUpdate({ ...(poll as any), commentCount: ((poll as any).commentCount || 0) + 1, recentComments: [...(((poll as any).recentComments ?? [])), created].slice(-2) } as any);
            } catch {
              setCommentError('Failed to add comment');
            }
          }}>
            Post comment
          </Button>
        </View>
      ) : null}
    </View>
  );
}

export function HubFeed({ scope, onBack, targetPostId, onTargetPostHandled, header }: Props) {
  const stableScope = React.useMemo(() => {
    if (!scope || scope.id == null) return null;
    if (scope.type === 'platform') {
      return { type: 'platform' as const, id: String(scope.id) };
    }
    const idNum = typeof scope.id === 'string' ? Number(scope.id) : scope.id;
    if (!Number.isFinite(idNum)) return null;
    const normalizedType = scope.type === 'orgGroup' ? 'group' : (scope as ScopeBase).type;
    return { type: normalizedType as ScopeBase['type'], id: idNum };
  }, [scope]);

  const scopeValid = Boolean(stableScope);

  const HEADER_EXPANDED = 220;
  const HEADER_COLLAPSED = 72;
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const headerHeight = scrollY.interpolate({
    inputRange: [0, HEADER_EXPANDED - HEADER_COLLAPSED],
    outputRange: [HEADER_EXPANDED, HEADER_COLLAPSED],
    extrapolate: 'clamp',
  });
  const heroOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_EXPANDED - HEADER_COLLAPSED],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const barOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_EXPANDED - HEADER_COLLAPSED],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const [posts, setPosts] = useState<HubPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  const [composerVisible, setComposerVisible] = useState(false);
  const [pollVisible, setPollVisible] = useState(false);
  const [editing, setEditing] = useState<HubPost | null>(null);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [commentPost, setCommentPost] = useState<HubPost | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [replyToId, setReplyToId] = useState<number | null>(null);
  const [commentReactionMenu, setCommentReactionMenu] = useState<number | null>(null);
  const [polls, setPolls] = useState<HubPoll[]>([]);
  const [pollsLoading, setPollsLoading] = useState(false);
  const [pollsError, setPollsError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [editingPoll, setEditingPoll] = useState<HubPoll | null>(null);
  const listRef = React.useRef<FlatList<FeedItem>>(null);
  const feedItems = React.useMemo<FeedItem[]>(() => {
    const postItems = posts.map((item) => ({
      kind: 'post' as const,
      sortAt: new Date(item.createdAt).getTime() || 0,
      item,
    }));
    const pollItems = polls.map((item) => ({
      kind: 'poll' as const,
      sortAt: new Date(item.createdAt).getTime() || 0,
      item,
    }));
    return [...postItems, ...pollItems].sort((a, b) => b.sortAt - a.sortAt);
  }, [polls, posts]);
  const buildCommentTree = (list: any[]) => {
    if (!list?.length) return [];
    const nodes = list.map((c) => ({ ...c, replies: [] as any[] }));
    const lookup = new Map<number, any>();
    nodes.forEach((n) => lookup.set(n.id, n));
    const roots: any[] = [];
    nodes.forEach((n) => {
      const parentId = n.parent_comment || n.parentCommentId;
      if (parentId && lookup.has(parentId)) {
        lookup.get(parentId).replies.push(n);
      } else {
        roots.push(n);
      }
    });
    return roots;
  };

  const renderCommentNode = (c: any, depth: number) => {
    const created = c.created_at || c.createdAt;
    const author = c.author || {};
    const user = author.user_details || author.user || {};
    const role = author.role || null;
    const baseName = getHubAuthorName(user, 'Member');
    const displayName = formatMemberLabel(baseName, role, null, 'Member');
    const initials = displayName ? (displayName.trim().charAt(0) || 'M').toUpperCase() : 'M';
    const viewerReaction = c.viewer_reaction || c.viewerReaction;
    const summary = c.reaction_summary || c.reactionSummary || {};
    const isReplyingHere = replyToId === c.id && !editingCommentId;
    const commentPostId = c.post || c.postId || commentPost?.id;
    return (
      <View
        key={c.id}
        style={{
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: '#E5E7EB',
          backgroundColor: '#FFFFFF',
          marginTop: depth ? 6 : 10,
          marginLeft: depth ? 12 : 0,
          gap: 6,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar.Text size={28} label={initials} style={{ backgroundColor: '#4B5563' }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: '#111827' }}>{displayName}</Text>
            {created ? <Text style={{ color: '#6B7280', fontSize: 12 }}>{formatHubDate(created)}</Text> : null}
          </View>
        </View>

        <Text style={{ color: '#111827', marginTop: 2 }}>{c.body}</Text>

        {Object.entries(summary).filter(([, v]) => Number(v) > 0).length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
            {Object.entries(summary)
              .filter(([, v]) => Number(v) > 0)
              .map(([reaction, count]) => {
                const emoji = reactionEmojis[reaction as keyof typeof reactionEmojis] ?? '';
                const qty = Number(count) || 0;
                return (
                  <View key={reaction} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 14 }}>{emoji}</Text>
                    <Text style={{ color: '#111827', fontSize: 12 }}>{qty}</Text>
                  </View>
                );
              })}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Menu
            visible={commentReactionMenu === c.id}
            onDismiss={() => setCommentReactionMenu(null)}
            anchor={
              <Button
                compact
                onPress={() => setCommentReactionMenu(c.id)}
              >
                {viewerReaction ? (reactionEmojis[viewerReaction as keyof typeof reactionEmojis] || '') : 'React'}
              </Button>
            }
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4, gap: 10 }}>
              {Object.keys(reactionEmojis).map((key) => (
                <TouchableOpacity
                  key={key}
                  onPress={async () => {
                    setCommentReactionMenu(null);
                    try {
                      await reactToHubComment(commentPostId, c.id, key as HubReactionType);
                      onRefresh();
                    } catch {
                      setCommentError('Failed to react');
                    }
                  }}
                  style={{ padding: 6 }}
                >
                  <Text style={{ fontSize: 16 }}>{reactionEmojis[key as keyof typeof reactionEmojis] || ''}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {viewerReaction ? (
              <Menu.Item
                onPress={() =>
                  removeHubCommentReaction(commentPostId, c.id)
                    .then(onRefresh)
                    .catch(() => setCommentError('Failed to remove reaction'))
                }
                title="Remove reaction"
              />
            ) : null}
          </Menu>
          <Button compact onPress={() => { setReplyToId(c.id); setEditingCommentId(null); }}>
            Reply
          </Button>
          {c.can_edit || c.is_admin ? (
            <Button
              compact
              onPress={() => {
                setCommentDraft(c.body);
                setEditingCommentId(c.id);
              }}
            >
              Edit
            </Button>
          ) : null}
          {c.can_edit || c.is_admin ? (
            <Button
              compact
              textColor="#DC2626"
              onPress={async () => {
                try {
                  await deleteHubComment(c.post, c.id);
                  setComments((prev) => prev.filter((item) => item.id !== c.id));
                  onRefresh();
                } catch {
                  setCommentError('Failed to delete comment');
                }
              }}
            >
              Delete
            </Button>
          ) : null}
        </View>

        {c.replies?.length ? (
          <View style={{ marginTop: 4, gap: 6 }}>
            {c.replies.map((child: any) => renderCommentNode(child, depth + 1))}
          </View>
        ) : null}
        {isReplyingHere ? (
          <View style={{ marginTop: 8, gap: 6, marginLeft: 6 }}>
            <TextInput
              mode="outlined"
              label="Reply"
              placeholder="Reply to comment"
              value={commentDraft}
              onChangeText={setCommentDraft}
              multiline
            />
            {commentError ? <HelperText type="error">{commentError}</HelperText> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                mode="contained"
                onPress={async () => {
                  if (!commentPost || !commentDraft.trim()) return;
                  setCommentsLoading(true);
                  try {
                    const payload = { body: commentDraft.trim(), parentComment: c.id } as any;
                    const created = await createHubComment(commentPost.id, payload);
                    setComments((prev) => [...prev, created]);
                    setCommentDraft('');
                    setReplyToId(null);
                    onRefresh();
                  } catch {
                    setCommentError('Failed to add reply');
                  } finally {
                    setCommentsLoading(false);
                  }
                }}
              >
                Post reply
              </Button>
              <Button
                mode="text"
                onPress={() => {
                  setReplyToId(null);
                  setCommentDraft('');
                  setCommentError(null);
                }}
              >
                Cancel
              </Button>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const load = useCallback(
    async (url?: string, append = false) => {
      if (!stableScope) return;
      if (url && url === next && append === false) return;
      setLoading(true);
      try {
        // If a next URL is provided, use it; otherwise fetch for the current scope (include attachments)
        const data: any = url
          ? await fetchHubPosts(url as any)
          : await fetchHubPosts({ ...(stableScope as any), includeAttachments: true });
        const list = Array.isArray(data?.posts)
          ? data.posts
          : Array.isArray(data?.results)
            ? data.results
            : Array.isArray(data)
              ? data
              : [];
        setPosts((prev) => (append ? [...prev, ...list] : list));
        setNext((data as any)?.next ?? null);
      } catch (err) {
        // swallow for now
      } finally {
        setLoading(false);
      }
    },
    [stableScope, next],
  );

  useEffect(() => {
    setPosts([]);
    setNext(null);
    setCommentPost(null);
    setComments([]);
    setCommentDraft('');
    setCommentError(null);
    setEditingCommentId(null);
    setReplyToId(null);
    void load();
    setPolls([]);
    setPollsError(null);
    setPollsLoading(true);
    fetchHubPolls(stableScope as any)
      .then((data: any) => {
        const list = Array.isArray(data) ? data : Array.isArray((data as any)?.results) ? (data as any).results : [];
        setPolls(list);
      })
      .catch(() => setPollsError('Failed to load polls'))
      .finally(() => setPollsLoading(false));
  }, [scope, load]);

  useEffect(() => {
    if (!targetPostId || !feedItems.length) return;
    const index = feedItems.findIndex((entry) => entry.kind === 'post' && entry.item.id === targetPostId);
    if (index < 0) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.1 });
      onTargetPostHandled?.();
    }, 150);
    return () => clearTimeout(timer);
  }, [feedItems, onTargetPostHandled, targetPostId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(undefined, false);
      setPollsLoading(true);
      const data: any = await fetchHubPolls(stableScope as any);
      const list = Array.isArray(data) ? data : Array.isArray((data as any)?.results) ? (data as any).results : [];
      setPolls(list);
    } catch {
      setPollsError('Failed to load polls');
    } finally {
      setPollsLoading(false);
      setRefreshing(false);
    }
  }, [load, stableScope]);

  const renderFooter = () => {
    if (!next) return null;
    return (
      <Button onPress={() => load(next, true)} mode="text" style={{ marginVertical: 8 }}>
        Load more
      </Button>
    );
  };

  if (!scopeValid) {
    return (
      <View style={{ padding: 16 }}>
        <Text>Select a pharmacy or organization to see posts.</Text>
      </View>
    );
  }

  const listHeader = () => (
    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: header ? 0 : 12, paddingBottom: 8, alignItems: 'center' }}>
      <Button icon="pencil" mode="contained" onPress={() => { setEditing(null); setComposerVisible(true); }}>
        New post
      </Button>
      <Button
        icon="poll"
        mode="contained-tonal"
        onPress={() => {
          setEditingPoll(null);
          setPollVisible(true);
        }}
      >
        New poll
      </Button>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {header ? (
        <Animated.View style={[feedStyles.headerContainer, { height: headerHeight }]}>
          {header.cover ? <Image source={{ uri: header.cover }} style={feedStyles.headerImage} /> : null}
          <View style={feedStyles.headerTopRow}>
            {onBack ? (
              <IconButton
                icon="arrow-left"
                mode="contained-tonal"
                size={22}
                onPress={onBack}
                style={{ margin: 0 }}
              />
            ) : null}
            {(header.canEditProfile && header.onEditProfile) || header.actions?.length ? (
              <Animated.View style={{ opacity: heroOpacity }}>
                <Menu
                  visible={profileMenuVisible}
                  onDismiss={() => setProfileMenuVisible(false)}
                  anchor={
                    <IconButton
                      icon="dots-vertical"
                      mode="contained-tonal"
                      size={20}
                      onPress={() => setProfileMenuVisible(true)}
                    />
                  }
                >
                  {header.canEditProfile && header.onEditProfile ? (
                    <Menu.Item
                      onPress={() => {
                        setProfileMenuVisible(false);
                        header.onEditProfile?.();
                      }}
                      title="Edit profile"
                      leadingIcon="pencil"
                    />
                  ) : null}
                  {(header.actions ?? []).map((action) => (
                    <Menu.Item
                      key={action.title}
                      onPress={() => {
                        setProfileMenuVisible(false);
                        action.onPress();
                      }}
                      title={action.title}
                      leadingIcon={action.icon}
                      titleStyle={action.destructive ? { color: '#DC2626' } : undefined}
                    />
                  ))}
                </Menu>
              </Animated.View>
            ) : null}
          </View>
          <Animated.View style={[feedStyles.heroOverlay, { opacity: heroOpacity }]}>
            <Text style={feedStyles.heroTitle}>{header.title}</Text>
            {header.subtitle ? <Text style={feedStyles.heroSubtitle}>{header.subtitle}</Text> : null}
          </Animated.View>
          <Animated.View style={[feedStyles.barTitleContainer, { opacity: barOpacity }]}>
            <Text numberOfLines={1} style={feedStyles.barTitle}>{header.title}</Text>
          </Animated.View>
        </Animated.View>
      ) : null}

      <Animated.FlatList
        ref={listRef}
        key={stableScope ? `${stableScope.type}:${stableScope.id}` : 'empty-scope'}
        data={feedItems}
        keyExtractor={(entry) => `${entry.kind}-${entry.item.id}`}
        renderItem={({ item: entry }) =>
          entry.kind === 'post' ? (
            <PostCard
              post={entry.item}
              onEdit={(p) => { setEditing(p); setComposerVisible(true); }}
              onComment={() => {
                setCommentPost(entry.item);
                setComments([]);
                setCommentDraft('');
                setCommentError(null);
                setCommentsLoading(true);
                fetchHubComments(entry.item.id)
                  .then((data: any) => {
                    const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
                    const withPost = list.map((c: any) => ({ ...c, post: c.post || c.postId || entry.item.id }));
                    setComments(withPost);
                  })
                  .catch(() => setCommentError('Failed to load comments'))
                  .finally(() => setCommentsLoading(false));
              }}
              onRefresh={onRefresh}
              highlighted={targetPostId === entry.item.id}
            />
          ) : (
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              <PollCardMobile
                poll={entry.item}
                onUpdate={(updated) => setPolls((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))}
                onVote={async (pollId, optionId) => {
                  if (!entry.item.canVote) return;
                  try {
                    setPolls((prev) =>
                      prev.map((p) =>
                        p.id === pollId ? { ...p, selectedOptionId: optionId, hasVoted: true } : p,
                      ),
                    );
                    const updated = await voteHubPoll(pollId, optionId);
                    setPolls((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
                  } catch {
                    setPollsError('Failed to vote');
                  }
                }}
                onEdit={entry.item.canManage ? () => {
                  setEditingPoll(entry.item);
                  setPollVisible(true);
                } : undefined}
                onDelete={entry.item.canManage ? () => {
                  Alert.alert('Delete poll', 'Are you sure you want to delete this poll?', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await deleteHubPoll(entry.item.id);
                          setPolls((prev) => prev.filter((p) => p.id !== entry.item.id));
                        } catch {
                          setPollError('Failed to delete poll');
                        }
                      },
                    },
                  ]);
                } : undefined}
              />
            </View>
          )
        }
        ListHeaderComponent={
          <>
            {listHeader()}
            {pollsError ? <HelperText type="error">{pollsError}</HelperText> : null}
            {pollError ? <HelperText type="error">{pollError}</HelperText> : null}
          </>
        }
        ListFooterComponent={renderFooter}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          (loading || pollsLoading) && feedItems.length === 0 ? (
            <View style={{ padding: 16, alignItems: 'center' }}>
              <ActivityIndicator />
            </View>
          ) : (
            <View style={{ padding: 16 }}>
              <Text style={{ color: '#6B7280' }}>No posts yet.</Text>
            </View>
          )
        }
        contentContainerStyle={{ paddingTop: header ? HEADER_EXPANDED + 16 : 8, paddingBottom: 24 }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      />

      <PostComposer
        visible={composerVisible}
        onDismiss={() => { setComposerVisible(false); setEditing(null); }}
        scope={scope}
        onSaved={async (post, mode) => {
          setPosts((prev) => {
            if (mode === 'edit') {
              return prev.map((item) => (item.id === post.id ? post : item));
            }
            const withoutDuplicate = prev.filter((item) => item.id !== post.id);
            return [post, ...withoutDuplicate];
          });
          await onRefresh();
        }}
        editing={editing || undefined}
      />
      <PollComposer
        visible={pollVisible}
        onDismiss={() => {
          setPollVisible(false);
          setEditingPoll(null);
        }}
        scope={scope}
        onSaved={onRefresh}
        editing={editingPoll || undefined}
      />

      <Portal>
        <Modal
          visible={!!commentPost}
          onDismiss={() => {
            setCommentPost(null);
            setComments([]);
            setCommentDraft('');
            setCommentError(null);
            setEditingCommentId(null);
            setReplyToId(null);
          }}
          contentContainerStyle={commentModalStyles.container}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text variant="titleMedium">Comments</Text>
            <IconButton icon="close" onPress={() => { setCommentPost(null); setComments([]); setCommentDraft(''); setCommentError(null); }} />
          </View>
          <ScrollView style={commentModalStyles.list} contentContainerStyle={{ paddingBottom: 12 }}>
            {commentsLoading ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <ActivityIndicator />
              </View>
            ) : comments.length ? (
              <View style={{ gap: 8 }}>
                {buildCommentTree(comments).map((node) => renderCommentNode(node, 0))}
              </View>
            ) : (
              <Text style={{ color: '#6B7280', marginVertical: 8 }}>No comments yet.</Text>
            )}
          </ScrollView>
        <Divider style={{ marginVertical: 8 }} />
        {!replyToId ? (
          <View style={{ gap: 8 }}>
            <TextInput
              mode="outlined"
              label={replyToId ? 'Reply' : 'Add a comment'}
              placeholder={editingCommentId ? 'Edit your comment' : replyToId ? 'Reply to comment' : 'Add a comment'}
              value={commentDraft}
              onChangeText={setCommentDraft}
              multiline
              style={{ marginBottom: 4 }}
            />
            {commentError ? <HelperText type="error">{commentError}</HelperText> : null}
            <Button
              mode="contained"
              onPress={async () => {
                if (!commentPost || !commentDraft.trim()) return;
                setCommentsLoading(true);
                try {
                  const payload = { body: commentDraft.trim(), parentComment: replyToId || null } as any;
                  let created: any;
                  if (editingCommentId) {
                    created = await updateHubComment(commentPost.id, editingCommentId, payload);
                    setComments((prev) => prev.map((c) => (c.id === editingCommentId ? created : c)));
                  } else {
                created = await createHubComment(commentPost.id, payload);
                setComments((prev) => [...prev, { ...created, post: commentPost.id }]);
                  }
                  setCommentDraft('');
                  setEditingCommentId(null);
                  setReplyToId(null);
                  onRefresh();
                } catch {
                  setCommentError('Failed to add comment');
                } finally {
                  setCommentsLoading(false);
                }
              }}
            >
              Post comment
            </Button>
          </View>
        ) : null}
        </Modal>
      </Portal>
    </View>
  );
}

const feedStyles = StyleSheet.create({
  headerContainer: {
    width: '100%',
    backgroundColor: '#111827',
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerImage: { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 },
  headerTopRow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    gap: 6,
  },
  heroTitle: { color: 'white', fontSize: 22, fontWeight: '800' },
  heroSubtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 14 },
  barTitleContainer: {
    position: 'absolute',
    bottom: 10,
    left: 16,
    right: 16,
  },
  barTitle: { color: 'white', fontWeight: '700', fontSize: 16 },
});

const pollStyles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  question: { fontWeight: '700', color: '#111827', marginBottom: 8 },
  option: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    backgroundColor: '#F9FAFB',
  },
  optionSelected: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  optionLabel: { fontWeight: '600', color: '#111827' },
  optionMeta: { color: '#6B7280', marginTop: 2, fontSize: 12 },
});

const commentModalStyles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    maxHeight: '85%',
    minHeight: 260,
  },
  list: { maxHeight: '65%' },
});
