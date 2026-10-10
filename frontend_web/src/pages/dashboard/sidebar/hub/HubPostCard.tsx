import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  InputBase,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { ChevronLeft, ChevronRight, FileText, Megaphone, MessageCircle, MoreHorizontal, Pin, SendHorizontal, ThumbsUp } from 'lucide-react';
import { EMOJI_FONT, fullTimestamp, initialsOf, relativeTime, renderRichText, roleLabel } from '../../../../components/social/socialFormat';
import { Pill } from '../../../../components/ui/Pill';

import {
  createHubComment,
  fetchHubComments,
  reactToHubComment,
  reactToHubPost,
  removeHubCommentReaction,
  removeHubReaction,
} from '../../../../api/hub';
import type {
  HubAttachment,
  HubComment,
  HubCommentPayload,
  HubPost,
  HubReactionType,
} from '../../../../types/hub';
import { useAuth } from '../../../../contexts/AuthContext';
import { getHubAuthorName, getMemberDisplayName } from './hubUtils';

const REACTION_LABELS: Record<HubReactionType, string> = {
  LIKE: 'Like',
  CELEBRATE: 'Celebrate',
  SUPPORT: 'Support',
  INSIGHTFUL: 'Insightful',
  LOVE: 'Love',
};
import {
  reactionEmojis,
  type CommentNode,
  buildCommentTree,
} from './HubFeed.helpers';

export interface PostCardProps {
  post: HubPost;
  onUpdate: (updatedPost: HubPost) => void;
  onEdit?: (post: HubPost) => void;
  onDelete?: (post: HubPost) => void;
  highlighted?: boolean;
}


export function PostCard({ post, onUpdate, onEdit, onDelete, highlighted = false }: PostCardProps) {
  const { user } = useAuth();
  const [reactionAnchorEl, setReactionAnchorEl] = useState<null | HTMLElement>(null);
  const [optionsAnchorEl, setOptionsAnchorEl] = useState<null | HTMLElement>(null);
  const reactionMenuOpen = Boolean(reactionAnchorEl);
  const optionsMenuOpen = Boolean(optionsAnchorEl);
  const [commentReactionMenu, setCommentReactionMenu] = useState<{ commentId: number; anchorEl: HTMLElement } | null>(null);
  const commentReactionMenuOpen = Boolean(commentReactionMenu);

  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [comments, setComments] = useState<HubComment[]>(post.recentComments ?? []);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [hasLoadedAllComments, setHasLoadedAllComments] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({ root: '' });
  const [submittingDraftKey, setSubmittingDraftKey] = useState<string | null>(null);
  const [activeReplyBox, setActiveReplyBox] = useState<string | null>(null);
  const rootCommentInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);

  useEffect(() => {
    setCommentCount(post.commentCount);
  }, [post.commentCount]);

  useEffect(() => {
    if (!hasLoadedAllComments) {
      setComments(post.recentComments ?? []);
    }
  }, [post.recentComments, hasLoadedAllComments]);

  const commentTree = useMemo(() => buildCommentTree(comments), [comments]);

  const replaceComment = (updated: HubComment) => {
    setComments((prev) => prev.map((comment) => (comment.id === updated.id ? updated : comment)));
  };


  const activeCommentForReactionMenu = useMemo(
    () =>
      commentReactionMenu
        ? comments.find((comment) => comment.id === commentReactionMenu.commentId) || null
        : null,
    [commentReactionMenu, comments],
  );

  const handleReactClick = (event: React.MouseEvent<HTMLElement>) => {
    setReactionAnchorEl(event.currentTarget);
  };

  const handleReactionMenuClose = () => {
    setReactionAnchorEl(null);
  };

  const openCommentReactionMenu = (event: React.MouseEvent<HTMLElement>, commentId: number) => {
    setCommentReactionMenu({ anchorEl: event.currentTarget, commentId });
  };

  const closeCommentReactionMenu = () => {
    setCommentReactionMenu(null);
  };

  const handleSelectReaction = async (reaction: HubReactionType) => {
    handleReactionMenuClose();
    try {
      const updatedPost = await reactToHubPost(post.id, reaction);
      onUpdate(updatedPost);
    } catch (error) {
      console.error('Failed to react to post:', error);
      setCommentError("We couldn't add your reaction. Try again.");
    }
  };

  const loadAllComments = async () => {
    if (commentsLoading || hasLoadedAllComments) {
      return;
    }
    setCommentsLoading(true);
    try {
      const data = await fetchHubComments(post.id);
      setComments(data);
      setHasLoadedAllComments(true);
    } catch (error) {
      console.error('Failed to load comments:', error);
      setCommentError("We couldn't load the comments. Try again.");
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleDraftChange = (key: string, value: string) => {
    setReplyDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const submitCommentDraft = async (key: string, parentId: number | null) => {
    const draft = (replyDrafts[key] || '').trim();
    if (!draft) {
      return;
    }
    setSubmittingDraftKey(key);
    const payload: HubCommentPayload = {
      body: draft,
      parentComment: parentId ?? null,
    };
    try {
      const created = await createHubComment(post.id, payload);
      setComments((prev) => [...prev, created]);
      setCommentCount((prev) => {
        const next = prev + 1;
        onUpdate({ ...post, commentCount: next });
        return next;
      });
      setReplyDrafts((prev) => ({ ...prev, [key]: '' }));
      if (key !== 'root') {
        setActiveReplyBox(null);
      }
    } catch (error) {
      console.error('Failed to submit comment:', error);
      setCommentError("Your comment wasn't posted. It's still in the box, so you can try again.");
    } finally {
      setSubmittingDraftKey(null);
    }
  };

  const handleRootSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    submitCommentDraft('root', null);
  };

  const handleReplySubmit = (event: React.FormEvent, key: string, parentId: number) => {
    event.preventDefault();
    submitCommentDraft(key, parentId);
  };

  const handleSelectCommentReaction = async (reaction: HubReactionType) => {
    const targetCommentId = commentReactionMenu?.commentId;
    closeCommentReactionMenu();
    if (!targetCommentId) {
      return;
    }
    try {
      const updated = await reactToHubComment(post.id, targetCommentId, reaction);
      replaceComment(updated);
    } catch (error) {
      console.error('Failed to react to comment:', error);
    }
  };

  const handleRemoveCommentReaction = async (commentId: number) => {
    closeCommentReactionMenu();
    try {
      const updated = await removeHubCommentReaction(post.id, commentId);
      replaceComment(updated);
    } catch (error) {
      console.error('Failed to remove reaction from comment:', error);
    }
  };

  const authorName = getHubAuthorName(post.author.user, 'Member');
  const authorAvatar = post.author.user.profilePhotoUrl || null;
  const authorRole = roleLabel(post.author.role);
  const isAuthor = Boolean(user?.id && post.author?.user?.id === user.id);
  const canEditDelete = isAuthor; // backend restricts edit/delete to the author only
  const [activeAttachment, setActiveAttachment] = useState(0);
  const reactionEntries = Object.entries(post.reactionSummary || {}).filter(([, count]) => count > 0) as Array<[HubReactionType, number]>;
  const reactionTotal = reactionEntries.reduce((sum, [, count]) => sum + count, 0);
  const meName = `${(user as any)?.first_name || ''} ${(user as any)?.last_name || ''}`.trim() || (user as any)?.username || 'Me';

  const renderAttachment = (attachment: HubAttachment) => {
    const src = attachment.url;
    if (!src) return null;
    const filename = attachment.filename?.toLowerCase() ?? '';
    const isImage = attachment.kind === 'IMAGE' || attachment.kind === 'GIF';
    const videoExtensions = ['.mp4', '.mov', '.webm', '.ogg', '.m4v'];
    const isVideo = !isImage && videoExtensions.some((ext) => filename.endsWith(ext));
    if (isImage) {
      return (
        <Box component="a" href={src} target="_blank" rel="noopener noreferrer" aria-label={`Open ${attachment.filename || 'image'}`} sx={{ display: 'block' }}>
          <Box component="img" src={src} alt={attachment.filename || 'Attachment'} sx={{ width: '100%', borderRadius: '14px', maxHeight: 480, objectFit: 'cover', display: 'block' }} />
        </Box>
      );
    }
    if (isVideo) {
      return <Box component="video" controls src={src} style={{ width: '100%', borderRadius: 14, backgroundColor: '#000' }} />;
    }
    return (
      <Box component="a" href={src} target="_blank" rel="noopener noreferrer" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.5, borderRadius: '14px', border: '1px solid var(--ct-border-color)', bgcolor: 'var(--ct-subtle-bg)', textDecoration: 'none', color: 'var(--ct-text-primary)' }}>
        <FileText size={20} color="var(--ct-accent-strong)" />
        <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{attachment.filename || 'Download attachment'}</Typography>
      </Box>
    );
  };

  const canComment = post.allowComments !== false;

  const handleFocusComment = () => {
    if (!canComment) return;
    setActiveReplyBox('root');
    if (rootCommentInputRef.current) {
      rootCommentInputRef.current.focus();
      rootCommentInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleRemovePostReaction = async () => {
    handleReactionMenuClose();
    try {
      await removeHubReaction(post.id);
      const summary = { ...(post.reactionSummary || {}) } as Record<string, number>;
      if (post.viewerReaction) summary[post.viewerReaction] = Math.max(0, (summary[post.viewerReaction] || 1) - 1);
      onUpdate({ ...post, viewerReaction: null, reactionSummary: summary });
    } catch (error) {
      console.error('Failed to remove reaction:', error);
      setCommentError("We couldn't remove your reaction. Try again.");
    }
  };

  const avatarSx = (size: number) => ({ width: size, height: size, fontSize: Math.round(size * 0.36), fontWeight: 600, bgcolor: 'var(--ct-tone-violet-bg)', color: 'var(--ct-tone-violet-fg)' });

  const renderCommentNode = (node: CommentNode, depth = 0) => {
    const commenterName = getHubAuthorName(node.author.user, 'Member');
    const commenterAvatar = node.author.user.profilePhotoUrl || null;
    const commenterRole = roleLabel(node.author.role);
    const entries = Object.entries(node.reactionSummary || {}).filter(([, count]) => count > 0) as Array<[HubReactionType, number]>;
    const viewerReaction = node.viewerReaction;
    const replyKey = `reply-${node.id}`;
    const replyDraft = replyDrafts[replyKey] ?? '';
    const replyOpen = activeReplyBox === replyKey;

    return (
      <Box key={node.id} sx={{ mt: 1.25, ml: depth ? { xs: 3, sm: 5.5 } : 0 }}>
        <Stack direction="row" spacing={1.25} alignItems="flex-start">
          <Avatar src={commenterAvatar || undefined} alt={commenterName} sx={avatarSx(depth ? 28 : 34)}>
            {!commenterAvatar && initialsOf(null, null, commenterName)}
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Box sx={{ display: 'inline-block', maxWidth: '100%', px: 1.5, py: 1, borderRadius: '16px', bgcolor: 'var(--ct-subtle-bg)', border: '1px solid var(--ct-border-color)' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--ct-text-primary)' }}>
                {commenterName}
                {commenterRole && <Box component="span" sx={{ fontWeight: 400, color: 'var(--ct-text-secondary)' }}> · {commenterRole}</Box>}
              </Typography>
              <Typography variant="body2" component="div" sx={{ mt: 0.25, whiteSpace: 'pre-wrap', color: node.isDeleted ? 'var(--ct-text-secondary)' : 'var(--ct-text-primary)', fontStyle: node.isDeleted ? 'italic' : 'normal', overflowWrap: 'anywhere' }}>
                {node.isDeleted ? 'This comment was deleted' : renderRichText(node.body, 'them')}
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.25} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.25, ml: 0.5 }}>
              <Tooltip title={fullTimestamp(node.createdAt)}>
                <Typography variant="caption" sx={{ color: 'var(--ct-text-secondary)', mr: 0.5 }}>{relativeTime(node.createdAt)}</Typography>
              </Tooltip>
              {!node.isDeleted && (
                <Button
                  size="small"
                  onClick={(event) => openCommentReactionMenu(event, node.id)}
                  sx={{ minWidth: 0, minHeight: 28, px: 0.75, fontSize: 12.5, fontWeight: 600, color: viewerReaction ? 'var(--ct-accent-strong)' : 'var(--ct-text-secondary)' }}
                >
                  {viewerReaction ? REACTION_LABELS[viewerReaction] : 'React'}
                </Button>
              )}
              {!node.isDeleted && canComment && (
                <Button
                  size="small"
                  onClick={() => setActiveReplyBox(replyOpen ? null : replyKey)}
                  sx={{ minWidth: 0, minHeight: 28, px: 0.75, fontSize: 12.5, fontWeight: 600, color: 'var(--ct-text-secondary)' }}
                >
                  Reply
                </Button>
              )}
              {entries.length > 0 && (
                <Tooltip title={entries.map(([r, c]) => `${REACTION_LABELS[r]} ${c}`).join(' · ')}>
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, ml: 0.5, px: 0.75, height: 22, borderRadius: '999px', bgcolor: 'var(--ct-surface-bg)', border: '1px solid var(--ct-border-color)', fontSize: 12, color: 'var(--ct-text-secondary)' }}>
                    <span style={{ fontFamily: EMOJI_FONT, fontSize: 13 }}>{entries.map(([r]) => reactionEmojis[r]).join('')}</span>
                    {entries.reduce((sum, [, c]) => sum + c, 0)}
                  </Box>
                </Tooltip>
              )}
            </Stack>
          </Box>
        </Stack>
        {replyOpen && (
          <Box sx={{ ml: { xs: 3, sm: 5.5 }, mt: 1 }}>
            <CommentField
              placeholder={`Reply to ${commenterName.split(' ')[0]}…`}
              value={replyDraft}
              onChange={(value) => handleDraftChange(replyKey, value)}
              onSubmit={(event) => handleReplySubmit(event, replyKey, node.id)}
              busy={submittingDraftKey === replyKey}
              avatar={<Avatar sx={avatarSx(28)}>{initialsOf(null, null, meName)}</Avatar>}
              autoFocus
            />
          </Box>
        )}
        {node.replies.map((child) => renderCommentNode(child, depth + 1))}
      </Box>
    );
  };

  const hiddenComments = Math.max(0, commentCount - comments.length);

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 'var(--ct-card-radius)',
        boxShadow: 'none',
        borderWidth: highlighted ? 2 : 1,
        borderColor: highlighted ? 'var(--ct-accent-strong)' : 'var(--ct-border-color)',
        bgcolor: 'var(--ct-surface-bg)',
        scrollMarginTop: 96,
      }}
    >
      <CardContent sx={{ p: { xs: 1.75, md: 2.25 }, '&:last-child': { pb: { xs: 1.75, md: 2.25 } } }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Avatar src={authorAvatar || undefined} alt={authorName} sx={avatarSx(44)}>
            {!authorAvatar && initialsOf(null, null, authorName)}
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body1" component="div" sx={{ fontWeight: 600, color: 'var(--ct-text-primary)', lineHeight: 1.3 }}>
              {authorName}
              {authorRole && <Box component="span" sx={{ fontWeight: 400, color: 'var(--ct-text-secondary)' }}> · {authorRole}</Box>}
            </Typography>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.25 }}>
              <Tooltip title={fullTimestamp(post.createdAt)}>
                <Typography variant="body2" sx={{ color: 'var(--ct-text-secondary)', fontSize: 13 }}>
                  {relativeTime(post.createdAt)}{post.isEdited ? ' · edited' : ''}
                </Typography>
              </Tooltip>
              {post.isPinned && <Pill tone="violet" icon={<Pin />} label="Pinned" />}
              {post.visibility === 'ANNOUNCEMENT' && <Pill tone="amber" icon={<Megaphone />} label="Announcement" />}
            </Stack>
          </Box>
          {canEditDelete && (
            <>
              <IconButton aria-label="Post options" aria-haspopup="menu" onClick={(event) => setOptionsAnchorEl(event.currentTarget)} sx={{ width: 36, height: 36, color: 'var(--ct-text-secondary)' }}>
                <MoreHorizontal size={18} />
              </IconButton>
              <Menu anchorEl={optionsAnchorEl} open={optionsMenuOpen} onClose={() => setOptionsAnchorEl(null)}>
                <MenuItem onClick={() => { setOptionsAnchorEl(null); onEdit?.(post); }}>Edit post</MenuItem>
                <MenuItem onClick={() => { setOptionsAnchorEl(null); onDelete?.(post); }} sx={{ color: 'error.main' }}>Delete post</MenuItem>
              </Menu>
            </>
          )}
        </Stack>

        {post.body && (
          <Typography component="div" sx={{ mt: 1.5, whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.55, color: 'var(--ct-text-primary)', overflowWrap: 'anywhere' }}>
            {renderRichText(post.body, 'them')}
          </Typography>
        )}

        {post.taggedMembers && post.taggedMembers.length > 0 && (
          <Typography variant="body2" sx={{ mt: 1, color: 'var(--ct-text-secondary)' }}>
            with{' '}
            {post.taggedMembers.map((member, i) => (
              <Fragment key={member.membershipId}>
                {i > 0 && (i === post.taggedMembers!.length - 1 ? ' and ' : ', ')}
                <Box component="span" sx={{ fontWeight: 600, color: 'var(--ct-text-primary)' }}>{getMemberDisplayName(member)}</Box>
              </Fragment>
            ))}
          </Typography>
        )}

        {post.attachments.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            {post.attachments.length === 1 ? (
              renderAttachment(post.attachments[0])
            ) : (
              <Stack spacing={1}>
                <Box sx={{ borderRadius: '14px', overflow: 'hidden' }}>
                  {renderAttachment(post.attachments[Math.min(activeAttachment, post.attachments.length - 1)])}
                </Box>
                <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
                  <IconButton aria-label="Previous attachment" onClick={() => setActiveAttachment((prev) => Math.max(prev - 1, 0))} disabled={activeAttachment === 0}><ChevronLeft size={18} /></IconButton>
                  <Typography variant="body2" sx={{ color: 'var(--ct-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{activeAttachment + 1} of {post.attachments.length}</Typography>
                  <IconButton aria-label="Next attachment" onClick={() => setActiveAttachment((prev) => Math.min(prev + 1, post.attachments.length - 1))} disabled={activeAttachment >= post.attachments.length - 1}><ChevronRight size={18} /></IconButton>
                </Stack>
              </Stack>
            )}
          </Box>
        )}

        {(reactionTotal > 0 || commentCount > 0) && (
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mt: 1.5 }}>
            {reactionTotal > 0 ? (
              <Tooltip title={reactionEntries.map(([r, c]) => `${REACTION_LABELS[r]} ${c}`).join(' · ')}>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'var(--ct-text-secondary)' }}>
                  <span style={{ fontFamily: EMOJI_FONT, fontSize: 16, letterSpacing: 1 }}>{reactionEntries.slice(0, 3).map(([r]) => reactionEmojis[r]).join('')}</span>
                  <Typography variant="body2" sx={{ color: 'inherit' }}>
                    {post.viewerReaction ? (reactionTotal === 1 ? 'You' : `You and ${reactionTotal - 1} ${reactionTotal - 1 === 1 ? 'other' : 'others'}`) : reactionTotal}
                  </Typography>
                </Stack>
              </Tooltip>
            ) : <span />}
            {commentCount > 0 && (
              <Button size="small" onClick={() => { void loadAllComments(); }} sx={{ minHeight: 32, px: 0.75, color: 'var(--ct-text-secondary)', fontWeight: 500 }}>
                {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
              </Button>
            )}
          </Stack>
        )}

        <Stack direction="row" sx={{ mt: 1, pt: 0.5, borderTop: '1px solid var(--ct-border-color)', '& > *': { flex: 1 } }}>
          <Button
            onClick={handleReactClick}
            aria-haspopup="menu"
            startIcon={post.viewerReaction ? <span style={{ fontFamily: EMOJI_FONT, fontSize: 18 }}>{reactionEmojis[post.viewerReaction]}</span> : <ThumbsUp size={18} />}
            sx={{ minHeight: 44, color: post.viewerReaction ? 'var(--ct-accent-strong)' : 'var(--ct-text-secondary)', fontWeight: 600 }}
          >
            {post.viewerReaction ? REACTION_LABELS[post.viewerReaction] : 'React'}
          </Button>
          <Button onClick={handleFocusComment} disabled={!canComment} startIcon={<MessageCircle size={18} />} sx={{ minHeight: 44, color: 'var(--ct-text-secondary)', fontWeight: 600 }}>
            Comment
          </Button>
        </Stack>

        <Menu anchorEl={reactionAnchorEl} open={reactionMenuOpen} onClose={handleReactionMenuClose} anchorOrigin={{ vertical: 'top', horizontal: 'left' }} transformOrigin={{ vertical: 'bottom', horizontal: 'left' }} slotProps={{ paper: { sx: { borderRadius: '999px' } } }}>
          <Stack direction="row" spacing={0.25} sx={{ px: 0.75, py: 0.25 }} role="group" aria-label="Choose a reaction">
            {(Object.keys(reactionEmojis) as HubReactionType[]).map((reaction) => (
              <Tooltip key={reaction} title={REACTION_LABELS[reaction]}>
                <IconButton aria-label={REACTION_LABELS[reaction]} aria-pressed={post.viewerReaction === reaction} onClick={() => handleSelectReaction(reaction)} sx={{ width: 44, height: 44, fontSize: 24, fontFamily: EMOJI_FONT, transition: 'transform .12s', '&:hover': { transform: 'scale(1.18)', bgcolor: 'transparent' } }}>
                  {reactionEmojis[reaction]}
                </IconButton>
              </Tooltip>
            ))}
          </Stack>
          {post.viewerReaction && <MenuItem onClick={() => void handleRemovePostReaction()} sx={{ justifyContent: 'center', fontSize: 13 }}>Remove my reaction</MenuItem>}
        </Menu>
        <Menu anchorEl={commentReactionMenu?.anchorEl ?? null} open={commentReactionMenuOpen} onClose={closeCommentReactionMenu} slotProps={{ paper: { sx: { borderRadius: '16px' } } }}>
          <Stack direction="row" spacing={0.25} sx={{ px: 0.75, py: 0.25 }} role="group" aria-label="Choose a reaction">
            {(Object.keys(reactionEmojis) as HubReactionType[]).map((reaction) => (
              <Tooltip key={reaction} title={REACTION_LABELS[reaction]}>
                <IconButton aria-label={REACTION_LABELS[reaction]} onClick={() => handleSelectCommentReaction(reaction)} sx={{ width: 40, height: 40, fontSize: 20, fontFamily: EMOJI_FONT }}>
                  {reactionEmojis[reaction]}
                </IconButton>
              </Tooltip>
            ))}
          </Stack>
          {commentReactionMenu?.commentId && activeCommentForReactionMenu?.viewerReaction ? (
            <MenuItem onClick={() => handleRemoveCommentReaction(commentReactionMenu.commentId)} sx={{ justifyContent: 'center', fontSize: 13 }}>Remove my reaction</MenuItem>
          ) : null}
        </Menu>

        <Box sx={{ mt: commentTree.length || hiddenComments || canComment ? 1 : 0 }}>
          {commentError && <Alert severity="error" onClose={() => setCommentError(null)} sx={{ mb: 1 }}>{commentError}</Alert>}
          {hiddenComments > 0 && (
            <Button size="small" onClick={loadAllComments} disabled={commentsLoading} startIcon={commentsLoading ? <CircularProgress size={14} /> : undefined} sx={{ minHeight: 32, px: 0.75, fontWeight: 600 }}>
              {commentsLoading ? 'Loading comments…' : comments.length ? `View ${hiddenComments} more ${hiddenComments === 1 ? 'comment' : 'comments'}` : `View ${hiddenComments} ${hiddenComments === 1 ? 'comment' : 'comments'}`}
            </Button>
          )}
          {commentTree.map((node) => renderCommentNode(node))}
          {!canComment && <Typography variant="body2" sx={{ mt: 1, color: 'var(--ct-text-secondary)' }}>Comments are turned off for this post.</Typography>}
          {canComment && (
            <Box sx={{ mt: 1.25 }}>
              <CommentField
                placeholder={commentCount === 0 ? 'Be the first to comment…' : 'Write a comment…'}
                value={replyDrafts.root ?? ''}
                onChange={(value) => handleDraftChange('root', value)}
                onSubmit={handleRootSubmit}
                busy={submittingDraftKey === 'root'}
                inputRef={rootCommentInputRef}
                avatar={<Avatar sx={avatarSx(34)}>{initialsOf(null, null, meName)}</Avatar>}
              />
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

function CommentField({
  placeholder,
  value,
  onChange,
  onSubmit,
  busy,
  avatar,
  inputRef,
  autoFocus,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  busy: boolean;
  avatar: React.ReactNode;
  inputRef?: React.Ref<HTMLInputElement | HTMLTextAreaElement>;
  autoFocus?: boolean;
}) {
  return (
    <Stack direction="row" spacing={1.25} alignItems="flex-end" component="form" onSubmit={onSubmit}>
      {avatar}
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'flex-end', borderRadius: '18px', border: '1px solid var(--ct-border-color)', bgcolor: 'var(--ct-subtle-bg)', '&:focus-within': { borderColor: 'var(--ct-accent-strong)', bgcolor: 'var(--ct-surface-bg)' } }}>
        <InputBase
          multiline
          maxRows={6}
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (value.trim() && !busy) onSubmit(event as unknown as React.FormEvent);
            }
          }}
          inputRef={inputRef}
          inputProps={{ 'aria-label': placeholder.replace('…', '') }}
          sx={{ flex: 1, px: 1.5, py: 0.9, fontSize: 14.5 }}
        />
        <IconButton type="submit" aria-label="Send comment" disabled={busy || !value.trim()} sx={{ width: 38, height: 38, m: 0.25, color: 'var(--ct-accent-strong)' }}>
          {busy ? <CircularProgress size={18} /> : <SendHorizontal size={18} />}
        </IconButton>
      </Box>
    </Stack>
  );
}
