import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputBase,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SendIcon from '@mui/icons-material/Send';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';
import ThumbUpAltOutlinedIcon from '@mui/icons-material/ThumbUpAltOutlined';

import {
  createHubComment,
  fetchHubComments,
  reactToHubComment,
  reactToHubPost,
  removeHubCommentReaction,
} from '../../../../api/hub';
import type {
  HubAttachment,
  HubComment,
  HubCommentPayload,
  HubPost,
  HubReactionType,
} from '../../../../types/hub';
import { useAuth } from '../../../../contexts/AuthContext';
import {
  formatHubAuthorLabel,
  formatHubDate,
  formatMemberLabel,
  getHubAuthorName,
  getMemberDisplayName,
} from './hubUtils';
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

  const currentUserInitial = useMemo(() => {
    const source = user?.username || user?.email || '';
    return source ? source.charAt(0).toUpperCase() : 'U';
  }, [user]);

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

  const authorName = getHubAuthorName(post.author.user, 'Unknown User');
  const authorAvatar = post.author.user.profilePhotoUrl || null;
  const authorRole = post.author.role?.trim() || null;
  const authorLabel = formatHubAuthorLabel(post.author.user, authorRole, 'Unknown User');
  const isAuthor = Boolean(user?.id && post.author?.user?.id === user.id);
  const canEditDelete = isAuthor; // backend now restricts edit/delete to the author only
  const postTimestamp = formatHubDate(post.createdAt);
  const [activeAttachment, setActiveAttachment] = useState(0);

  const renderAttachment = (attachment: HubAttachment) => {
    const src = attachment.url;
    if (!src) return null;
    const filename = attachment.filename?.toLowerCase() ?? '';
    const isImage = attachment.kind === 'IMAGE' || attachment.kind === 'GIF';
    const videoExtensions = ['.mp4', '.mov', '.webm', '.ogg', '.m4v'];
    const isVideo = attachment.kind !== 'IMAGE' && attachment.kind !== 'GIF' && videoExtensions.some((ext) => filename.endsWith(ext));

    if (isImage) {
      return (
        <Box
          component="img"
          src={src}
          alt={attachment.filename || 'Attachment'}
          sx={{ width: '100%', borderRadius: 2, maxHeight: 450, objectFit: 'cover' }}
        />
      );
    }
    if (isVideo) {
      return (
        <Box component="video" controls src={src} style={{ width: '100%', borderRadius: 8, backgroundColor: '#000' }} />
      );
    }
    return (
      <Button
        component="a"
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        startIcon={<InsertDriveFileIcon />}
        variant="outlined"
        sx={{ justifyContent: 'flex-start', textTransform: 'none', borderColor: 'grey.300', color: 'text.primary' }}
      >
        {attachment.filename || 'Download attachment'}
      </Button>
    );
  };

  const canComment = post.allowComments !== false;

  const handleFocusComment = () => {
    if (!canComment) {
      return;
    }
    setActiveReplyBox('root');
    if (rootCommentInputRef.current) {
      rootCommentInputRef.current.focus();
      rootCommentInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const renderCommentNode = (node: CommentNode, depth = 0) => {
    const commenterName = getHubAuthorName(node.author.user, 'Member');
    const commenterAvatar = node.author.user.profilePhotoUrl || null;
    const commenterRole = node.author.role?.trim() || null;
    const commenterLabel = formatHubAuthorLabel(node.author.user, commenterRole, 'Member');
    const reactionEntries = Object.entries(node.reactionSummary || {}).filter(([, count]) => count > 0);
    const viewerReaction = node.viewerReaction;
    const replyKey = `reply-${node.id}`;
    const replyDraft = replyDrafts[replyKey] ?? '';
    const replyOpen = activeReplyBox === replyKey;
    const timestamp = formatHubDate(node.createdAt);

    return (
      <Box key={node.id} sx={{ mt: 1.5, ml: depth ? depth * 3 : 0 }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Avatar
            src={commenterAvatar || undefined}
            alt={commenterName}
            sx={{
              width: 32,
              height: 32,
              fontSize: '0.875rem',
              bgcolor: commenterAvatar ? 'transparent' : 'secondary.main',
              color: commenterAvatar ? 'inherit' : 'common.white',
            }}
          >
            {!commenterAvatar && commenterName.charAt(0)}
          </Avatar>
          <Box sx={{ flexGrow: 1 }}>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'grey.50' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                  {commenterLabel}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {timestamp}
                </Typography>
              </Stack>
              <Typography
                variant="body2"
                sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}
                color={node.isDeleted ? 'text.secondary' : 'text.primary'}
              >
                {node.isDeleted ? 'Comment deleted' : node.body}
              </Typography>
              {(!node.isDeleted || reactionEntries.length > 0) && (
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.5 }}
                >
                  {!node.isDeleted && (
                    <IconButton
                      size="small"
                      onClick={(event) => openCommentReactionMenu(event, node.id)}
                      sx={{ p: 0.5 }}
                    >
                      <Typography variant="caption">
                        {viewerReaction ? `${reactionEmojis[viewerReaction]} ${viewerReaction}` : 'React'}
                      </Typography>
                    </IconButton>
                  )}
                  {reactionEntries.length > 0 && (
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                      {reactionEntries.map(([reaction, count]) => (
                        <Chip
                          key={reaction}
                          label={`${reactionEmojis[reaction as HubReactionType] ?? ''} ${count}`.trim()}
                          size="small"
                          sx={{ bgcolor: 'grey.200', height: 24 }}
                        />
                      ))}
                    </Stack>
                  )}
                  {!node.isDeleted && canComment && (
                    <Button
                      size="small"
                      variant="text"
                      sx={{ px: 0 }}
                      onClick={() => setActiveReplyBox(replyOpen ? null : replyKey)}
                    >
                      Reply
                    </Button>
                  )}
                </Stack>
              )}
            </Paper>
          </Box>
        </Stack>
        {replyOpen && (
          <Box sx={{ ml: depth ? (depth + 1) * 3 : 4, mt: 1 }}>
            <Paper
              component="form"
              onSubmit={(event) => handleReplySubmit(event, replyKey, node.id)}
              sx={{ p: '2px 4px', display: 'flex', alignItems: 'center', borderRadius: 5, border: '1px solid', borderColor: 'grey.300', boxShadow: 'none' }}
            >
              <InputBase
                sx={{ ml: 1, flex: 1 }}
                placeholder="Write a reply..."
                value={replyDraft}
                onChange={(event) => handleDraftChange(replyKey, event.target.value)}
              />
              <IconButton type="submit" sx={{ p: '10px' }} disabled={submittingDraftKey === replyKey || !replyDraft.trim()}>
                {submittingDraftKey === replyKey ? <CircularProgress size={18} /> : <SendIcon fontSize="small" />}
              </IconButton>
            </Paper>
          </Box>
        )}
        {node.replies.map((child) => renderCommentNode(child, depth + 1))}
      </Box>
    );
  };

  return (
    <Card
      sx={{
        borderRadius: 2,
        boxShadow: highlighted ? 3 : 1,
        border: highlighted ? '2px solid' : '1px solid',
        borderColor: highlighted ? 'primary.main' : 'grey.200',
        scrollMarginTop: 96,
      }}
    >
      <CardContent sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} alignItems="flex-start">
          <Avatar
            src={authorAvatar || undefined}
            alt={authorName}
            sx={{
              bgcolor: authorAvatar ? 'transparent' : 'primary.main',
              color: authorAvatar ? 'inherit' : 'common.white',
              fontWeight: 700,
            }}
          >
            {!authorAvatar && authorName.charAt(0)}
          </Avatar>
          <Stack spacing={0.5} sx={{ flexGrow: 1 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
              <Box>
                <Typography variant="subtitle2" component="div" sx={{ fontWeight: 'bold' }}>
                  {authorLabel}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {postTimestamp}
                </Typography>
              </Box>
              {canEditDelete && (
                <>
                  <IconButton size="small" onClick={(event) => setOptionsAnchorEl(event.currentTarget)}>
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                  <Menu
                    anchorEl={optionsAnchorEl}
                    open={optionsMenuOpen}
                    onClose={() => setOptionsAnchorEl(null)}
                  >
                    <MenuItem
                      onClick={() => {
                        setOptionsAnchorEl(null);
                        onEdit?.(post);
                      }}
                    >
                      Edit post
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        setOptionsAnchorEl(null);
                        onDelete?.(post);
                      }}
                    >
                      Delete post
                    </MenuItem>
                  </Menu>
                </>
              )}
            </Stack>
          </Stack>
        </Stack>

        <Typography variant="body1" sx={{ my: 2, whiteSpace: 'pre-wrap' }}>
          {post.body}
        </Typography>

        {post.attachments.length > 0 && (
          <Box sx={{ mb: 2 }}>
            {post.attachments.length === 1 ? (
              renderAttachment(post.attachments[0])
            ) : (
              <Stack spacing={1.5}>
                <Box sx={{ borderRadius: 2, overflow: 'hidden' }}>
                  {renderAttachment(post.attachments[Math.min(activeAttachment, post.attachments.length - 1)])}
                </Box>
                <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
                  <IconButton
                    size="small"
                    onClick={() => setActiveAttachment((prev) => Math.max(prev - 1, 0))}
                    disabled={activeAttachment === 0}
                  >
                    <ChevronLeftIcon fontSize="small" />
                  </IconButton>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    {post.attachments.map((att, idx) => (
                      <Box
                        key={att.id ?? idx}
                        onClick={() => setActiveAttachment(idx)}
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: idx === activeAttachment ? 'primary.main' : 'grey.300',
                          cursor: 'pointer',
                        }}
                      />
                    ))}
                  </Stack>
                  <IconButton
                    size="small"
                    onClick={() =>
                      setActiveAttachment((prev) => Math.min(prev + 1, post.attachments.length - 1))
                    }
                    disabled={activeAttachment >= post.attachments.length - 1}
                  >
                    <ChevronRightIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Stack>
            )}
          </Box>
        )}

        {post.taggedMembers && post.taggedMembers.length > 0 && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Tagged:
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
              {post.taggedMembers.map((member) => {
                const baseName = getMemberDisplayName(member);
                const label = formatMemberLabel(baseName, member.role, member.jobTitle);
                return (
                  <Chip
                    key={member.membershipId}
                    label={label}
                    size="small"
                  />
                );
              })}
            </Stack>
          </Stack>
        )}

        {(Object.keys(post.reactionSummary).length > 0 || commentCount > 0) && (
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            justifyContent="space-between"
            spacing={1}
            sx={{ mb: 1 }}
          >
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
              {Object.entries(post.reactionSummary).map(([reaction, count]) =>
                count > 0 ? (
                  <Tooltip key={reaction} title={`${count} ${reaction.toLowerCase()}`}>
                    <Chip
                      label={`${reactionEmojis[reaction as HubReactionType]} ${count}`}
                      size="small"
                      sx={{ bgcolor: 'grey.200' }}
                    />
                  </Tooltip>
                ) : null
              )}
            </Stack>
            {commentCount > 0 && (
              <Typography variant="body2" color="text.secondary">
                {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
              </Typography>
            )}
          </Stack>
        )}

        <Divider sx={{ mt: 1 }} />

        <Stack direction="row" justifyContent="space-around" sx={{ pt: 1, mb: 2 }}>
          <Button
            startIcon={post.viewerReaction ? <ThumbUpAltIcon color="primary" /> : <ThumbUpAltOutlinedIcon />}
            onClick={handleReactClick}
            sx={{ textTransform: 'none', color: post.viewerReaction ? 'primary.main' : 'text.secondary' }}
          >
            {post.viewerReaction ? `${reactionEmojis[post.viewerReaction]} ${post.viewerReaction}` : 'React'}
          </Button>
          <Menu
            anchorEl={reactionAnchorEl}
            open={reactionMenuOpen}
            onClose={handleReactionMenuClose}
          >
            <Stack direction="row" spacing={1} sx={{ p: 1 }}>
              {Object.entries(reactionEmojis).map(([reaction, emoji]) => (
                <IconButton key={reaction} onClick={() => handleSelectReaction(reaction as HubReactionType)}>
                  <Typography variant="h6">{emoji}</Typography>
                </IconButton>
              ))}
            </Stack>
          </Menu>
          <Menu
            anchorEl={commentReactionMenu?.anchorEl ?? null}
            open={commentReactionMenuOpen}
            onClose={closeCommentReactionMenu}
          >
            <Stack direction="row" spacing={1} sx={{ p: 1 }}>
              {Object.entries(reactionEmojis).map(([reaction, emoji]) => (
                <IconButton
                  key={reaction}
                  size="small"
                  onClick={() => handleSelectCommentReaction(reaction as HubReactionType)}
                >
                  <Typography variant="body2">{emoji}</Typography>
                </IconButton>
              ))}
            </Stack>
            {commentReactionMenu?.commentId && activeCommentForReactionMenu?.viewerReaction ? (
              <MenuItem onClick={() => handleRemoveCommentReaction(commentReactionMenu.commentId)}>
                Remove reaction
              </MenuItem>
            ) : null}
          </Menu>
          <Button
            startIcon={<ChatBubbleOutlineIcon />}
            sx={{ textTransform: 'none', color: 'text.secondary' }}
            onClick={handleFocusComment}
            disabled={!canComment}
          >
            Comment
          </Button>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        <Stack spacing={2}>
          {commentCount > comments.length && canComment && (
            <Button
              size="small"
              startIcon={<ChatBubbleOutlineIcon fontSize="small" />}
              sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
              onClick={loadAllComments}
              disabled={commentsLoading}
            >
              {commentsLoading
                ? 'Loading comments…'
                : `View ${commentCount - comments.length} more ${commentCount - comments.length === 1 ? 'comment' : 'comments'}`}
            </Button>
          )}
          {commentsLoading && comments.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : commentTree.length > 0 ? (
            commentTree.map((node) => renderCommentNode(node))
          ) : (
            <Typography variant="body2" color="text.secondary">
              {canComment ? 'Be the first to comment.' : 'Comments are disabled for this post.'}
            </Typography>
          )}

          {canComment && (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'grey.500', color: 'common.white', fontWeight: 600 }}>
                {currentUserInitial}
              </Avatar>
              <Paper
                component="form"
                onSubmit={handleRootSubmit}
                sx={{ p: '2px 4px', display: 'flex', alignItems: 'center', flexGrow: 1, borderRadius: 5, border: '1px solid', borderColor: 'grey.300', boxShadow: 'none' }}
              >
                <InputBase
                  sx={{ ml: 1, flex: 1 }}
                  placeholder="Write a comment..."
                  value={replyDrafts.root ?? ''}
                  onChange={(event) => handleDraftChange('root', event.target.value)}
                  inputRef={rootCommentInputRef}
                />
                <IconButton
                  type="submit"
                  sx={{ p: '10px' }}
                  aria-label="send"
                  disabled={submittingDraftKey === 'root' || !(replyDrafts.root ?? '').trim()}
                >
                  {submittingDraftKey === 'root' ? <CircularProgress size={20} /> : <SendIcon />}
                </IconButton>
              </Paper>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
