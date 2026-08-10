import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Image,
  ScrollView,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { Card, Text, Button, IconButton, Chip, Divider, Avatar, Menu } from 'react-native-paper';
import { deleteHubPost, reactToHubPost, removeHubReaction } from './api';
import type { HubPost, HubAttachment, HubReactionType } from './types';
import {
  formatHubDate,
  formatMemberLabel,
  getHubAuthorName,
  getMemberDisplayName,
  reactionEmojis,
} from './hubUtils';

type Props = {
  post: HubPost;
  onEdit: (post: HubPost) => void;
  onComment: (post: HubPost) => void;
  onRefresh: () => void;
  highlighted?: boolean;
};

export function PostCard({ post, onEdit, onComment, onRefresh, highlighted = false }: Props) {
  const [working, setWorking] = useState(false);
  const [reactionMenuVisible, setReactionMenuVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeAttachment, setActiveAttachment] = useState(0);

  const isAuthor = useMemo(() => {
    if ((post as any).canManage) return true;
    const authorUserId =
      (post as any).author?.user_details?.id ||
      (post as any).author?.user?.id ||
      (post as any).authorMembership?.user?.id ||
      null;
    const viewerId =
      (post as any).viewerId ||
      (post as any).viewer_id ||
      (post as any).requestUserId ||
      null;
    return Boolean(authorUserId && viewerId && authorUserId === viewerId);
  }, [post]);

  const handleDelete = useCallback(async () => {
    setWorking(true);
    try {
      await deleteHubPost(post.id);
      onRefresh();
    } catch (err) {
      console.warn('Unable to delete this post.', err);
    } finally {
      setWorking(false);
    }
  }, [post.id, onRefresh]);

  const handlePinToggle = useCallback(async () => {}, []);

  const handleReact = useCallback(async () => {
    setWorking(true);
    try {
      const current = (post as any).viewerReaction as HubReactionType | null | undefined;
      if (current) {
        await removeHubReaction(post.id);
      } else {
        await reactToHubPost(post.id, { reaction_type: 'LIKE' } as any);
      }
      onRefresh();
    } finally {
      setWorking(false);
    }
  }, [post.id, onRefresh, post]);

  const handleSelectReaction = useCallback(
    async (reaction: HubReactionType) => {
      setReactionMenuVisible(false);
      setWorking(true);
      try {
        await reactToHubPost(post.id, { reaction_type: reaction } as any);
        onRefresh();
      } finally {
        setWorking(false);
      }
    },
    [post.id, onRefresh],
  );

  const renderTags = () => {
    const tagged = (post as any).taggedMembers || (post as any).tagged_members || [];
    if (!tagged.length) return null;
    return (
      <View style={styles.tagRow}>
        {tagged.slice(0, 3).map((t: any, idx: number) => {
          const key = t.membership_id || t.membershipId || t.email || `tag-${idx}`;
          return (
            <Chip key={key} compact style={styles.tagChip}>
              @{getMemberDisplayName(t)}
            </Chip>
          );
        })}
        {tagged.length > 3 ? <Chip compact>+{tagged.length - 3}</Chip> : null}
      </View>
    );
  };

  const renderAttachments = () => {
    const attachments: HubAttachment[] = (post as any).attachments || [];
    if (!attachments.length) return null;
    if (attachments.length === 1) {
      const att = attachments[0];
      const isImage = att.kind === 'IMAGE' || att.kind === 'GIF';
      const label = att.filename || 'Attachment';
      const url = att.url || (att as any).file || '';
      if (!url) return null;
      if (isImage) {
        return (
          <TouchableOpacity activeOpacity={0.8} onPress={() => Linking.openURL(url)}>
            <Image
              source={{ uri: url }}
              style={{ width: '100%', height: 240, borderRadius: 12, backgroundColor: '#000' }}
              resizeMode="contain"
            />
          </TouchableOpacity>
        );
      }
      return (
        <Button mode="outlined" icon="file" onPress={() => url && Linking.openURL(url)}>
          {label}
        </Button>
      );
    }

    const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(
        e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width,
      );
      if (!Number.isNaN(index)) setActiveAttachment(index);
    };

    return (
      <View style={{ marginTop: 8 }}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          style={{ borderRadius: 12, overflow: 'hidden' }}
        >
          {attachments.map((att, idx) => {
            const isImage = att.kind === 'IMAGE' || att.kind === 'GIF';
            const label = att.filename || 'Attachment';
            const url = att.url || (att as any).file || '';
            if (!url) return null;
            if (isImage) {
              return (
                <TouchableOpacity
                  key={att.id || idx}
                  activeOpacity={0.8}
                  onPress={() => Linking.openURL(url)}
                  style={{ width: 300, maxWidth: '100%' }}
                >
                  <Image
                    source={{ uri: url }}
                    style={{ width: '100%', height: 240, backgroundColor: '#000' }}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              );
            }
            return (
              <View key={att.id || idx} style={{ width: 300, maxWidth: '100%', justifyContent: 'center' }}>
                <Button mode="outlined" icon="file" onPress={() => url && Linking.openURL(url)}>
                  {label}
                </Button>
              </View>
            );
          })}
        </ScrollView>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 6 }}>
          {attachments.map((_, idx) => (
            <View
              key={idx}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: idx === activeAttachment ? '#4F46E5' : '#E5E7EB',
              }}
            />
          ))}
        </View>
      </View>
    );
  };

  const author = (post as any).author || (post as any).authorMembership || {};
  const user =
    (author as any).user ||
    (author as any).user_details ||
    (author as any).userDetails ||
    {};
  const authorName = getHubAuthorName(user, 'Member');
  const authorAvatar =
    (user as any).profile_photo_url ||
    (user as any).profilePhotoUrl ||
    (user as any).profilePhoto;
  const role = (author as any).role || null;
  const createdAt = (post as any).createdAt || (post as any).created_at;
  const scopeLabel =
    (post as any).pharmacy_name ||
    (post as any).organization_name ||
    (post as any).community_group_name ||
    '';
  const reactionSummary = (post as any).reactionSummary || {};
  const reactionEntries = Object.entries(reactionSummary).filter(([, v]) => Number(v) > 0);
  const totalReactions = Object.values(reactionSummary).reduce(
    (sum: number, v: any) => sum + Number(v ?? 0),
    0,
  );
  const viewerReaction = (post as any).viewerReaction as HubReactionType | null | undefined;
  const viewerReactionLabel = viewerReaction
    ? `${reactionEmojis[viewerReaction] || ''} ${viewerReaction.toLowerCase()}`
    : 'React';

  return (
    <Card
      style={[
        styles.card,
        highlighted
          ? { borderWidth: 2, borderColor: '#4F46E5', backgroundColor: '#EEF2FF' }
          : null,
      ]}
      mode="elevated"
    >
      <Card.Content>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
            {authorAvatar ? (
              <Avatar.Image size={36} source={{ uri: authorAvatar }} />
            ) : (
              <Avatar.Text size={36} label={authorName?.charAt(0) || 'U'} />
            )}
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium" numberOfLines={1}>
                {formatMemberLabel(authorName, role)}
              </Text>
              <Text style={styles.muted} numberOfLines={1}>
                {formatHubDate(createdAt)}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {scopeLabel ? <Chip compact style={styles.scopeChip}>{scopeLabel}</Chip> : null}
            {isAuthor ? (
              <Menu
                visible={menuVisible}
                onDismiss={() => setMenuVisible(false)}
                anchor={
                  <IconButton
                    icon="dots-vertical"
                    size={20}
                    onPress={() => setMenuVisible(true)}
                  />
                }
              >
                <Menu.Item
                  onPress={() => {
                    setMenuVisible(false);
                    onEdit(post);
                  }}
                  title="Edit"
                  leadingIcon="pencil"
                />
                <Menu.Item
                  onPress={() => {
                    setMenuVisible(false);
                    handleDelete();
                  }}
                  title="Delete"
                  leadingIcon="trash-can-outline"
                />
              </Menu>
            ) : null}
          </View>
        </View>
        <Text style={styles.body}>{post.body}</Text>
        {renderTags()}
        {renderAttachments()}
        {reactionEntries.length ? (
          <View style={styles.reactionRow}>
            {reactionEntries.map(([reaction, count]) => (
              <Chip key={reaction} compact style={styles.reactionChip}>
                {(reactionEmojis[reaction] || '') + ' ' + count}
              </Chip>
            ))}
          </View>
        ) : null}
        <Divider style={{ marginVertical: 8 }} />
        <View style={styles.actions}>
          <Menu
            visible={reactionMenuVisible}
            onDismiss={() => setReactionMenuVisible(false)}
            anchor={
              <Button
                compact
                icon={(viewerReaction ? 'thumb-up' : 'thumb-up-outline') as any}
                onPress={() => {
                  if (viewerReaction) {
                    handleReact();
                  } else {
                    setReactionMenuVisible(true);
                  }
                }}
                disabled={working}
              >
                {totalReactions ? `${totalReactions}` : viewerReactionLabel}
              </Button>
            }
          >
            <View style={styles.reactionMenuRow}>
              {Object.keys(reactionEmojis).map((key) => (
                <IconButton
                  key={key}
                  icon={() => <Text style={{ fontSize: 20 }}>{reactionEmojis[key] || ''}</Text>}
                  onPress={() => handleSelectReaction(key as HubReactionType)}
                />
              ))}
              {viewerReaction ? (
                <IconButton
                  icon="delete"
                  onPress={handleReact}
                  accessibilityLabel="Remove reaction"
                />
              ) : null}
            </View>
          </Menu>
          <Button compact icon="comment-text-outline" onPress={() => onComment(post)}>
            {post.commentCount || 0} Comments
          </Button>
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  muted: { color: '#6B7280' },
  body: { fontSize: 15, color: '#111827' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  pinChip: { backgroundColor: '#EEF2FF' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tagChip: { backgroundColor: '#F3F4F6' },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  reactionChip: { backgroundColor: '#EEF2FF' },
  scopeChip: { backgroundColor: '#E0F2FE' },
  reactionMenuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
});
