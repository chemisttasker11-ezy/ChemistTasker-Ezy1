import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormHelperText,
  IconButton,
  InputBase,
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import BarChartIcon from '@mui/icons-material/BarChart';
import CancelIcon from '@mui/icons-material/Cancel';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import GroupIcon from '@mui/icons-material/Group';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SendIcon from '@mui/icons-material/Send';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';
import ThumbUpAltOutlinedIcon from '@mui/icons-material/ThumbUpAltOutlined';

import {
  createHubComment,
  createHubPollComment,
  createHubPoll,
  createHubPost,
  deleteHubPoll,
  deleteHubPost,
  fetchHubComments,
  fetchHubPollComments,
  fetchHubPolls,
  fetchHubPosts,
  reactToHubComment,
  reactToHubPoll,
  reactToHubPost,
  removeHubCommentReaction,
  removeHubPollReaction,
  updateHubPoll,
  updateHubPost,
  voteHubPoll,
} from '../../../../api/hub';
import type {
  HubAttachment,
  HubComment,
  HubCommentPayload,
  HubGroupMemberOption,
  HubPoll,
  HubPost,
  HubPostPayload,
  HubReactionType,
  HubScopeSelection,
} from '../../../../types/hub';
import { useAuth } from '../../../../contexts/AuthContext';
import { formatHubAuthorLabel, formatHubDate, formatMemberLabel, getHubAuthorName, getMemberDisplayName } from './hubUtils';

const reactionEmojis: Record<HubReactionType, string> = {
  LIKE: '\u{1F44D}',
  CELEBRATE: '\u{1F389}',
  SUPPORT: '\u{1F64C}',
  INSIGHTFUL: '\u{1F4A1}',
  LOVE: '\u{2764}\u{FE0F}',
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  const responseDetail = (
    error as { response?: { data?: { detail?: string } } } | null
  )?.response?.data?.detail;
  if (typeof responseDetail === 'string' && responseDetail.trim()) {
    return responseDetail.trim();
  }
  const detail = (error as { detail?: string } | null)?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }
  return fallback;
};

const useSubmissionGuard = () => {
  const lockRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const start = () => {
    if (lockRef.current) {
      return false;
    }
    lockRef.current = true;
    setSubmitting(true);
    return true;
  };

  const finish = () => {
    lockRef.current = false;
    setSubmitting(false);
  };

  return { submitting, start, finish };
};

function SubmissionStatusNotice({ message }: { message: string }) {
  return (
    <Box sx={{ px: 2, pb: 2 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
        <CircularProgress size={18} />
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
      </Stack>
      <LinearProgress />
    </Box>
  );
}

type CommentNode = HubComment & { replies: CommentNode[] };

const buildCommentTree = (list: HubComment[]): CommentNode[] => {
  if (!list?.length) {
    return [];
  }
  const sorted = [...list].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const nodes = sorted.map((comment) => ({ ...comment, replies: [] as CommentNode[] }));
  const lookup = new Map<number, CommentNode>();
  nodes.forEach((node) => lookup.set(node.id, node));
  const roots: CommentNode[] = [];
  nodes.forEach((node) => {
    if (node.parentCommentId && lookup.has(node.parentCommentId)) {
      lookup.get(node.parentCommentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
};

interface PostCardProps {
  post: HubPost;
  onUpdate: (updatedPost: HubPost) => void;
  onEdit?: (post: HubPost) => void;
  onDelete?: (post: HubPost) => void;
  highlighted?: boolean;
}


function PostCard({ post, onUpdate, onEdit, onDelete, highlighted = false }: PostCardProps) {
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
interface ScopeFeedProps {
  scope: HubScopeSelection;
  canCreatePost: boolean;
  membersLoader?: () => Promise<HubGroupMemberOption[]>;
  emptyTitle: string;
  emptyDescription: string;
  targetPostId?: number | null;
  onTargetPostHandled?: () => void;
}

type FeedItem =
  | { kind: 'post'; sortAt: number; item: HubPost }
  | { kind: 'poll'; sortAt: number; item: HubPoll };

export function ScopeFeed({
  scope,
  canCreatePost,
  membersLoader,
  emptyTitle,
  emptyDescription,
  targetPostId,
  onTargetPostHandled,
}: ScopeFeedProps) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const [posts, setPosts] = useState<HubPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [postContent, setPostContent] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [taggedMembers, setTaggedMembers] = useState<HubGroupMemberOption[]>([]);
  const [polls, setPolls] = useState<HubPoll[]>([]);
  const [pollsLoading, setPollsLoading] = useState(true);
  const [pollsError, setPollsError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [editingPoll, setEditingPoll] = useState<HubPoll | null>(null);
  const [isPollModalOpen, setPollModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<HubPost | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingError, setEditingError] = useState<string | null>(null);
  const [editingSaving, setEditingSaving] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerGuard = useSubmissionGuard();
  const pollGuard = useSubmissionGuard();
  const stableScope = useMemo<HubScopeSelection>(
    () => ({ type: scope.type, id: scope.id }),
    [scope.id, scope.type],
  );
  const feedItems = useMemo<FeedItem[]>(() => {
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
  useEffect(() => {
    setTaggedMembers([]);
    setComposerError(null);
  }, [stableScope]);

  useEffect(() => {
    setPosts([]);
    setPolls([]);
    setPostsError(null);
    setPollsError(null);
    setLoadingPosts(true);
    setPollsLoading(true);
    let isMounted = true;
    const loadPosts = async () => {
      try {
        const fetchedPosts = await fetchHubPosts(stableScope);
        if (isMounted) {
          setPosts(fetchedPosts.posts);
        }
      } catch (err) {
        console.error('Failed to fetch posts:', err);
        if (isMounted) {
          setPostsError('Failed to load posts. Please try again.');
        }
      } finally {
        if (isMounted) {
          setLoadingPosts(false);
        }
      }
    };
    loadPosts();
    return () => {
      isMounted = false;
    };
  }, [stableScope]);

  useEffect(() => {
    if (!targetPostId || loadingPosts || feedItems.length === 0) {
      return;
    }
    const targetPost = posts.find((item) => item.id === targetPostId);
    if (!targetPost) {
      return;
    }
    const element = document.getElementById(`hub-post-${targetPostId}`);
    if (element) {
      window.setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        onTargetPostHandled?.();
      }, 120);
    }
  }, [feedItems.length, loadingPosts, onTargetPostHandled, posts, targetPostId]);

  useEffect(() => {
    let isMounted = true;
    const loadPolls = async () => {
      try {
        const fetchedPolls = await fetchHubPolls(stableScope);
        if (isMounted) {
          setPolls(fetchedPolls);
        }
      } catch (err) {
        console.error('Failed to fetch polls:', err);
        if (isMounted) {
          setPollsError('Failed to load polls. Please try again.');
        }
      } finally {
        if (isMounted) {
          setPollsLoading(false);
        }
      }
    };
    loadPolls();
    return () => {
      isMounted = false;
    };
  }, [stableScope]);

  const handleCreatePost = async () => {
    if (!canCreatePost) return;
    if (!postContent.trim() && attachments.length === 0) {
      setComposerError('Add some text or at least one attachment before posting.');
      return;
    }
    if (!composerGuard.start()) return;
    const payload: HubPostPayload = { body: postContent };
    if (attachments.length > 0) {
      payload.attachments = attachments;
    }
    if (taggedMembers.length > 0) {
      payload.taggedMemberIds = Array.from(
        new Set(taggedMembers.map((member) => member.membershipId)),
      );
    }
    setComposerError(null);
    try {
      const newPost = await createHubPost(stableScope, payload);
      setPosts((prev) => [newPost, ...prev]);
      setPostContent('');
      setAttachments([]);
      setTaggedMembers([]);
    } catch (err) {
      console.error('Failed to create post:', err);
      setComposerError(getErrorMessage(err, 'Failed to create the post. Please try again.'));
    } finally {
      composerGuard.finish();
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) {
      return;
    }
    setAttachments((prev) => [...prev, ...Array.from(files)]);
  };

  const removeAttachment = (fileToRemove: File) => {
    setAttachments((prev) => prev.filter((file) => file !== fileToRemove));
  };

  const openPollModal = (poll?: HubPoll) => {
    if (!canCreatePost) return;
    setPollError(null);
    setEditingPoll(poll ?? null);
    setPollModalOpen(true);
  };

  const closePollModal = () => {
    setPollModalOpen(false);
    setEditingPoll(null);
    setPollError(null);
  };

  const handleCreatePoll = async (pollData: { question: string; options: string[] }) => {
    if (!canCreatePost) return;
    const question = pollData.question.trim();
    const optionLabels = pollData.options.map((opt) => opt.trim()).filter(Boolean);
    if (!question || optionLabels.length < 2) {
      setPollError('Please provide a question and at least two options.');
      return;
    }
    if (!pollGuard.start()) return;
    setPollError(null);
    try {
      if (editingPoll) {
        const updated = await updateHubPoll(editingPoll.id, {
          question,
          options: optionLabels,
        });
        setPolls((prev) => prev.map((poll) => (poll.id === updated.id ? updated : poll)));
      } else {
        const created = await createHubPoll(stableScope, { question, options: optionLabels });
        setPolls((prev) => [created, ...prev]);
      }
      closePollModal();
    } catch (err) {
      console.error('Failed to save poll:', err);
      setPollError('Failed to save poll. Please try again.');
    } finally {
      pollGuard.finish();
    }
  };

  const handleDeletePoll = async (poll: HubPoll) => {
    try {
      await deleteHubPoll(poll.id);
      setPolls((prev) => prev.filter((p) => p.id !== poll.id));
    } catch (err) {
      console.error('Failed to delete poll:', err);
      setPollError('Failed to delete poll. Please try again.');
    }
  };

  const handlePollVote = async (pollId: number, optionId: number) => {
    try {
      const updated = await voteHubPoll(pollId, optionId);
      setPolls((prev) => prev.map((poll) => (poll.id === updated.id ? updated : poll)));
    } catch (err) {
      console.error('Failed to vote on poll:', err);
    }
  };

  const handleStartEditPost = (post: HubPost) => {
    setEditingPost(post);
    setEditingContent(post.body);
    setEditingError(null);
  };

  const handleCloseEditPost = () => {
    if (editingSaving) return;
    setEditingPost(null);
    setEditingContent('');
    setEditingError(null);
  };

  const handleSaveEditPost = async () => {
    if (!editingPost) return;
    const trimmed = editingContent.trim();
    if (!trimmed) {
      setEditingError('Post content cannot be empty.');
      return;
    }
    setEditingSaving(true);
    setEditingError(null);
    try {
      const updated = await updateHubPost(editingPost.id, { body: trimmed });
      updatePost(updated);
      setEditingPost(null);
      setEditingContent('');
    } catch (err) {
      console.error('Failed to update post:', err);
      setEditingError('Failed to update post. Please try again.');
    } finally {
      setEditingSaving(false);
    }
  };

  const handleDeletePost = async (post: HubPost) => {
    const confirmed = window.confirm('Delete this post? This action cannot be undone.');
    if (!confirmed) return;
    try {
      await deleteHubPost(post.id);
      setPosts((prev) => prev.filter((item) => item.id !== post.id));
    } catch (err) {
      console.error('Failed to delete post:', err);
      setPostsError('Failed to delete post. Please try again.');
    }
  };

  const updatePost = (updatedPost: HubPost) => {
    setPosts((prev) => prev.map((post) => (post.id === updatedPost.id ? updatedPost : post)));
  };

  const updatePoll = (updatedPoll: HubPoll) => {
    setPolls((prev) => prev.map((poll) => (poll.id === updatedPoll.id ? updatedPoll : poll)));
  };

  return (
    <>
      <Stack spacing={3}>
      {canCreatePost && (
        <Card
          sx={{
            borderRadius: 2,
            border: '1px solid',
            borderColor: isDarkMode ? alpha(theme.palette.common.white, 0.12) : 'grey.200',
            boxShadow: 1,
            bgcolor: isDarkMode ? alpha(theme.palette.background.paper, 0.96) : 'background.paper',
          }}
        >
          <Box
            sx={{
              borderBottom: '1px solid',
              borderColor: isDarkMode ? alpha(theme.palette.common.white, 0.12) : 'grey.200',
              p: 2,
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
              Share an update with your team
            </Typography>
          </Box>
          <Box sx={{ p: 2 }}>
            {composerError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {composerError}
              </Alert>
            )}
            <TextField
              fullWidth
              multiline
              rows={4}
              placeholder="Announce new roster updates, reminders, or shout-outs..."
              value={postContent}
              onChange={(e) => {
                setPostContent(e.target.value);
                if (composerError) {
                  setComposerError(null);
                }
              }}
              disabled={composerGuard.submitting}
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 1,
                  alignItems: 'flex-start',
                  bgcolor: isDarkMode ? alpha(theme.palette.common.white, 0.06) : 'grey.50',
                  color: 'text.primary',
                  '& textarea::placeholder': {
                    color: isDarkMode
                      ? alpha(theme.palette.text.primary, 0.58)
                      : undefined,
                    opacity: 1,
                  },
                  '& fieldset': {
                    borderColor: isDarkMode
                      ? alpha(theme.palette.common.white, 0.18)
                      : 'grey.300',
                  },
                  '&:hover fieldset': { borderColor: 'primary.main' },
                  '&.Mui-focused fieldset': { borderColor: 'primary.main' },
                },
              }}
            />
          </Box>
          {attachments.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ p: 2, pt: 0, flexWrap: 'wrap', gap: 1 }}>
              {attachments.map((file, index) => (
                  <Chip
                    key={index}
                    icon={<InsertDriveFileIcon />}
                    label={file.name}
                    onDelete={composerGuard.submitting ? undefined : () => removeAttachment(file)}
                    deleteIcon={composerGuard.submitting ? undefined : <CancelIcon />}
                  />
                ))}
              </Stack>
            )}
          <input
            type="file"
              multiple
              ref={fileInputRef}
              onChange={handleFileSelect}
              disabled={composerGuard.submitting}
              style={{ display: 'none' }}
            />
            {composerGuard.submitting ? (
              <SubmissionStatusNotice message="Posting your update. Please wait and keep this window open." />
            ) : null}
            {membersLoader && (
              <Box sx={{ px: 2, pb: 2 }}>
                <TagMembersSelector
                  loadMembers={membersLoader}
                  value={taggedMembers}
                  onChange={setTaggedMembers}
                  disabled={composerGuard.submitting}
                />
              </Box>
            )}
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              borderTop: '1px solid',
              borderColor: isDarkMode ? alpha(theme.palette.common.white, 0.12) : 'grey.200',
              bgcolor: isDarkMode ? alpha(theme.palette.common.white, 0.04) : 'grey.50',
              p: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Button
                onClick={() => fileInputRef.current?.click()}
                startIcon={<AttachFileIcon sx={{ fontSize: 16 }} />}
                disabled={composerGuard.submitting}
                sx={{
                  textTransform: 'none',
                  color: isDarkMode ? 'grey.200' : 'text.secondary',
                  '&:hover': { color: 'primary.main' },
                }}
              >
                Add attachments
              </Button>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button
                onClick={() => openPollModal()}
                variant="outlined"
                startIcon={<BarChartIcon sx={{ fontSize: 16 }} />}
                disabled={composerGuard.submitting}
                sx={{
                  textTransform: 'none',
                  borderColor: isDarkMode ? alpha(theme.palette.common.white, 0.18) : 'grey.300',
                  color: 'text.primary',
                  '&:hover': {
                    bgcolor: isDarkMode ? alpha(theme.palette.common.white, 0.06) : 'grey.50',
                  },
                }}
              >
                Start Poll
              </Button>
              <Button
                onClick={handleCreatePost}
                disabled={composerGuard.submitting}
                variant="contained"
                startIcon={composerGuard.submitting ? <CircularProgress size={16} color="inherit" /> : <SendIcon sx={{ fontSize: 16 }} />}
                sx={{ textTransform: 'none', bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}
              >
                {composerGuard.submitting ? 'Posting...' : 'Post to Hub'}
              </Button>
            </Box>
          </Box>
        </Card>
      )}

      {postsError ? (
        <Alert severity="error">{postsError}</Alert>
      ) : null}
      {pollsError ? (
        <Alert severity="error">{pollsError}</Alert>
      ) : null}

      {(loadingPosts || pollsLoading) && feedItems.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
          <CircularProgress />
        </Box>
      ) : feedItems.length > 0 ? (
        <Stack spacing={2}>
          {feedItems.map((entry) =>
            entry.kind === 'post' ? (
              <Box key={`post-${entry.item.id}`} id={`hub-post-${entry.item.id}`}>
                <PostCard
                  post={entry.item}
                  onUpdate={updatePost}
                  onEdit={handleStartEditPost}
                  onDelete={handleDeletePost}
                  highlighted={targetPostId === entry.item.id}
                />
              </Box>
            ) : (
              <PollCard
                key={`poll-${entry.item.id}`}
                poll={entry.item}
                onUpdate={updatePoll}
                onVote={handlePollVote}
                onEdit={entry.item.canManage ? () => openPollModal(entry.item) : undefined}
                onDelete={entry.item.canManage ? () => handleDeletePoll(entry.item) : undefined}
              />
            ),
          )}
        </Stack>
      ) : (
        <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'grey.200', bgcolor: 'white', p: 3, textAlign: 'center', boxShadow: 1 }}>
          <GroupIcon sx={{ fontSize: 40, margin: '0 auto', marginBottom: 1.5, color: 'grey.400' }} />
          <Typography variant="h6" sx={{ fontWeight: 'semibold', color: 'text.primary' }}>
            {emptyTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {emptyDescription}
          </Typography>
        </Card>
      )}
      </Stack>
      {isPollModalOpen && (
        <StartPollModal
          onClose={closePollModal}
          onCreate={handleCreatePoll}
          submitting={pollGuard.submitting}
          error={pollError}
          editingPoll={editingPoll}
        />
      )}
      {editingPost && (
        <EditPostDialog
          open={Boolean(editingPost)}
          value={editingContent}
          onChange={setEditingContent}
          onClose={handleCloseEditPost}
          onSave={handleSaveEditPost}
          saving={editingSaving}
          error={editingError}
        />
      )}
    </>
  );
}

interface TagMembersSelectorProps {
  loadMembers?: () => Promise<HubGroupMemberOption[]>;
  value: HubGroupMemberOption[];
  onChange: (members: HubGroupMemberOption[]) => void;
  disabled?: boolean;
}

type AggregatedMemberOption = {
  key: string;
  fullName: string;
  email: string | null;
  role: string | null;
  jobTitle?: string | null;
  membershipIds: number[];
  pharmacyNames: string[];
};

const STAFF_EMPLOYMENT_TYPES = new Set(['FULL_TIME', 'PART_TIME', 'CASUAL']);
const filterPharmacyStaffMembers = (members: HubGroupMemberOption[]) =>
  members.filter((member) => STAFF_EMPLOYMENT_TYPES.has(member.employmentType || ''));

function TagMembersSelector({ loadMembers, value, onChange, disabled = false }: TagMembersSelectorProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const isDarkMode = theme.palette.mode === 'dark';
  const [options, setOptions] = useState<HubGroupMemberOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!loadMembers) {
      setOptions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadMembers()
      .then((members) => {
        if (isMounted) {
          setOptions(
            filterPharmacyStaffMembers(members).filter((member) => user?.id == null || member.userId !== user.id),
          );
        }
      })
      .catch(() => {
        if (isMounted) {
          setOptions([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [loadMembers, user?.id]);

  if (!loadMembers) {
    return null;
  }

  const membershipMap = useMemo(() => {
    const map = new Map<number, HubGroupMemberOption>();
    options.forEach((member) => {
      map.set(member.membershipId, member);
    });
    return map;
  }, [options]);

  const aggregatedOptions = useMemo<AggregatedMemberOption[]>(() => {
    const map = new Map<string, AggregatedMemberOption>();
    options.forEach((member) => {
      const key = member.userId ? `user-${member.userId}` : `membership-${member.membershipId}`;
      const entry = map.get(key);
      if (entry) {
        entry.membershipIds.push(member.membershipId);
        if (member.pharmacyName && !entry.pharmacyNames.includes(member.pharmacyName)) {
          entry.pharmacyNames.push(member.pharmacyName);
        }
        if (!entry.fullName && member.fullName) {
          entry.fullName = member.fullName;
        }
        if (!entry.email && member.email) {
          entry.email = member.email;
        }
        if (!entry.jobTitle && member.jobTitle) {
          entry.jobTitle = member.jobTitle;
        }
      } else {
        map.set(key, {
          key,
          fullName: getMemberDisplayName(member),
          email: member.email,
          role: member.role,
          jobTitle: member.jobTitle ?? null,
          membershipIds: [member.membershipId],
          pharmacyNames: member.pharmacyName ? [member.pharmacyName] : [],
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const labelA = (a.fullName || '').toLowerCase();
      const labelB = (b.fullName || '').toLowerCase();
      return labelA.localeCompare(labelB);
    });
  }, [options]);

  const selectedMembershipIds = useMemo(
    () => new Set(value.map((member) => member.membershipId)),
    [value],
  );

  const aggregatedValue = useMemo(
    () =>
      aggregatedOptions.filter((option) =>
        option.membershipIds.every((id) => selectedMembershipIds.has(id)),
      ),
    [aggregatedOptions, selectedMembershipIds],
  );

  const applyAggregatedSelection = (selection: AggregatedMemberOption[]) => {
    const ids = new Set<number>();
    selection.forEach((option) => option.membershipIds.forEach((id) => ids.add(id)));
    const normalized = Array.from(ids)
      .map((id) => membershipMap.get(id))
      .filter((member): member is HubGroupMemberOption => Boolean(member));
    onChange(normalized);
  };

  const isSelectAll =
    aggregatedOptions.length > 0 && aggregatedValue.length === aggregatedOptions.length;

  const previewMembers = aggregatedOptions.slice(0, 10);

  const formatRole = (role: string | null | undefined) =>
    role ? role.replace(/_/g, ' ') : '';

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2" sx={{ color: 'text.primary' }}>Tag members</Typography>
        <Button
          size="small"
          onClick={() => (isSelectAll ? onChange([]) : applyAggregatedSelection(aggregatedOptions))}
          disabled={disabled || !aggregatedOptions.length}
          sx={{ color: isDarkMode ? 'primary.light' : undefined }}
        >
          {isSelectAll ? 'Clear all' : 'Select all'}
        </Button>
      </Stack>
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          borderRadius: 2,
          bgcolor: isDarkMode ? alpha(theme.palette.common.white, 0.03) : 'background.paper',
          borderColor: isDarkMode ? alpha(theme.palette.common.white, 0.12) : undefined,
        }}
      >
        {loading && !options.length ? (
          <LinearProgress />
        ) : aggregatedOptions.length ? (
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {previewMembers.map((member) => {
              const baseName = member.fullName || 'Member';
              return (
                <Chip
                  key={member.key}
                  label={formatMemberLabel(baseName, member.role, member.jobTitle)}
                  size="small"
                  variant="outlined"
                  sx={{
                    color: 'text.primary',
                    borderColor: isDarkMode ? alpha(theme.palette.common.white, 0.14) : undefined,
                    bgcolor: isDarkMode ? alpha(theme.palette.common.white, 0.03) : undefined,
                  }}
                />
              );
            })}
            {aggregatedOptions.length > previewMembers.length && (
              <Chip
                label={`+${aggregatedOptions.length - previewMembers.length} more`}
                size="small"
                color="primary"
                variant="outlined"
              />
            )}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No members available to tag yet.
          </Typography>
        )}
      </Paper>
      <Autocomplete
        multiple
        disableCloseOnSelect
        options={aggregatedOptions}
        value={aggregatedValue}
        loading={loading}
        openOnFocus
        disabled={disabled}
        onChange={(_, newValue) => applyAggregatedSelection(newValue as AggregatedMemberOption[])}
        isOptionEqualToValue={(option, selected) => option.key === selected.key}
        getOptionLabel={(option) =>
          formatMemberLabel(option.fullName || 'Member', option.role, option.jobTitle)
        }
        renderOption={(props, option, { selected }) => (
          <li {...props}>
            <Checkbox checked={selected} sx={{ mr: 1 }} />
            <Box>
              <Typography variant="body2" fontWeight={600}>
                {option.fullName || 'Member'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {[
                  formatRole(option.role),
                  option.jobTitle,
                  option.pharmacyNames.join(', '),
                ]
                  .filter(Boolean)
                  .join(' | ')}
              </Typography>
            </Box>
          </li>
        )}
        renderTags={(tagValue, getTagProps) =>
          tagValue.map((option, index) => (
            <Chip
              {...getTagProps({ index })}
              label={formatMemberLabel(option.fullName || 'Member', option.role, option.jobTitle)}
              size="small"
            />
          ))
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label="Tag members"
            placeholder="@mention"
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: isDarkMode ? alpha(theme.palette.common.white, 0.03) : undefined,
                color: 'text.primary',
                '& fieldset': {
                  borderColor: isDarkMode ? alpha(theme.palette.common.white, 0.18) : undefined,
                },
              },
              '& .MuiInputLabel-root': {
                color: isDarkMode ? alpha(theme.palette.text.primary, 0.72) : undefined,
              },
              '& .MuiSvgIcon-root': {
                color: isDarkMode ? theme.palette.common.white : undefined,
              },
            }}
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading ? <CircularProgress size={16} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
        ListboxProps={{ style: { maxHeight: 320 } }}
      />
      <FormHelperText sx={{ color: isDarkMode ? alpha(theme.palette.text.primary, 0.72) : undefined }}>
        {loading
          ? 'Loading members…'
          : `${aggregatedOptions.length} member${aggregatedOptions.length === 1 ? '' : 's'} available`}
      </FormHelperText>
    </Stack>
  );
}

interface PollCardProps {
  poll: HubPoll;
  onUpdate: (poll: HubPoll) => void;
  onVote: (pollId: number, optionId: number) => void;
  onEdit?: (poll: HubPoll) => void;
  onDelete?: (poll: HubPoll) => void;
}

function PollCard({ poll, onUpdate, onVote, onEdit, onDelete }: PollCardProps) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [reactionAnchorEl, setReactionAnchorEl] = useState<null | HTMLElement>(null);
  const [comments, setComments] = useState<HubComment[]>(poll.recentComments ?? []);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const totalVotes = poll.totalVotes;
  const authorName = getHubAuthorName(poll.author?.user, 'Member');
  const authorLabel = formatHubAuthorLabel(poll.author?.user, poll.author?.role, 'Member');
  const authorAvatar = poll.author?.user?.profilePhotoUrl || null;
  const pollTimestamp = formatHubDate(poll.createdAt);
  const reactionEntries = Object.entries(poll.reactionSummary || {}).filter(([, count]) => count > 0);
  const viewerReaction = poll.viewerReaction;

  const handleVote = (optionId: number) => {
    if (!poll.canVote) return;
    onVote(poll.id, optionId);
  };

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  };

  const handleCloseMenu = () => setMenuAnchor(null);

  const handleEdit = () => {
    handleCloseMenu();
    onEdit?.(poll);
  };

  const handleDelete = () => {
    handleCloseMenu();
    onDelete?.(poll);
  };

  const loadComments = async () => {
    if (commentsLoading) return;
    setCommentsLoading(true);
    setCommentError(null);
    try {
      const data = await fetchHubPollComments(poll.id);
      setComments(data);
    } catch (error) {
      console.error('Failed to load poll comments:', error);
      setCommentError('Failed to load comments.');
    } finally {
      setCommentsLoading(false);
    }
  };

  const toggleComments = async () => {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next) {
      await loadComments();
    }
  };

  const handleSelectReaction = async (reaction: HubReactionType) => {
    setReactionAnchorEl(null);
    try {
      const updated = await reactToHubPoll(poll.id, reaction);
      onUpdate(updated);
    } catch (error) {
      console.error('Failed to react to poll:', error);
    }
  };

  const handleRemoveReaction = async () => {
    setReactionAnchorEl(null);
    try {
      const updated = await removeHubPollReaction(poll.id);
      onUpdate(updated);
    } catch (error) {
      console.error('Failed to remove reaction from poll:', error);
    }
  };

  const handleSubmitComment = async () => {
    const body = commentDraft.trim();
    if (!body) return;
    setCommentError(null);
    try {
      const created = await createHubPollComment(poll.id, { body });
      setCommentDraft('');
      setComments((prev) => [...prev, created]);
      onUpdate({
        ...poll,
        commentCount: poll.commentCount + 1,
        recentComments: [...(poll.recentComments ?? []), created].slice(-2),
      });
    } catch (error) {
      console.error('Failed to create poll comment:', error);
      setCommentError(getErrorMessage(error, 'Failed to add comment.'));
    }
  };

  return (
    <Card sx={{ borderRadius: 2, boxShadow: 1 }}>
      <CardContent sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
            <Stack spacing={1} sx={{ flex: 1 }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Avatar src={authorAvatar || undefined} alt={authorName}>
                  {!authorAvatar && authorName.charAt(0)}
                </Avatar>
                <Stack spacing={0.25}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {authorLabel}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {pollTimestamp}
                  </Typography>
                </Stack>
              </Stack>
              <Stack spacing={0.5}>
              <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1.2 }}>
                Poll
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {poll.question}
              </Typography>
              </Stack>
            </Stack>
            {(onEdit || onDelete) && (
              <>
                <IconButton onClick={handleOpenMenu} size="small">
                  <MoreVertIcon />
                </IconButton>
                <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleCloseMenu}>
                  {onEdit && <MenuItem onClick={handleEdit}>Edit</MenuItem>}
                  {onDelete && <MenuItem onClick={handleDelete}>Delete</MenuItem>}
                </Menu>
              </>
            )}
          </Stack>
          <Stack spacing={1.5}>
            {poll.options
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((option) => {
                const votes = option.voteCount;
                const percentage = option.percentage ?? (totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0);
                const isSelected = poll.selectedOptionId === option.id;
              return (
                <Box
                  key={option.id}
                  onClick={() => handleVote(option.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && poll.canVote) {
                      event.preventDefault();
                      handleVote(option.id);
                    }
                  }}
                  sx={{
                    border: '1px solid',
                    borderColor: isSelected ? 'primary.main' : 'grey.200',
                    borderRadius: 2,
                    p: 1.5,
                    bgcolor: isSelected ? 'primary.light' : 'grey.50',
                    cursor: poll.canVote ? 'pointer' : 'default',
                    transition: 'all 150ms ease',
                    '&:hover': poll.canVote
                      ? {
                          borderColor: 'primary.main',
                          bgcolor: 'grey.100',
                        }
                      : undefined,
                  }}
                >
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {option.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {percentage}%
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={percentage}
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        bgcolor: 'grey.200',
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 4,
                          bgcolor: isSelected ? 'primary.main' : 'primary.light',
                        },
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {votes} {votes === 1 ? 'vote' : 'votes'}
                    </Typography>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                size="small"
                onClick={(event) => setReactionAnchorEl(event.currentTarget)}
                startIcon={poll.viewerReaction ? <ThumbUpAltIcon fontSize="small" /> : <ThumbUpAltOutlinedIcon fontSize="small" />}
                sx={{ textTransform: 'none' }}
              >
                {viewerReaction ? `${reactionEmojis[viewerReaction]} ${viewerReaction}` : 'React'}
              </Button>
              <Button
                size="small"
                onClick={toggleComments}
                startIcon={<ChatBubbleOutlineIcon fontSize="small" />}
                sx={{ textTransform: 'none' }}
              >
                Comment{poll.commentCount ? ` (${poll.commentCount})` : ''}
              </Button>
              <Typography variant="caption" color="text.secondary">
                {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              {reactionEntries.map(([reaction, count]) => (
                <Chip key={reaction} size="small" label={`${reactionEmojis[reaction as HubReactionType] || ''} ${count}`} />
              ))}
              {poll.hasVoted && (
                <Chip label="You voted" size="small" color="primary" variant="outlined" sx={{ fontWeight: 600 }} />
              )}
            </Stack>
          </Stack>
          <Menu anchorEl={reactionAnchorEl} open={Boolean(reactionAnchorEl)} onClose={() => setReactionAnchorEl(null)}>
            <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', px: 1, py: 0.5, gap: 0.5 }}>
              {Object.keys(reactionEmojis).map((reaction) => (
                <IconButton
                  key={reaction}
                  size="small"
                  onClick={() => handleSelectReaction(reaction as HubReactionType)}
                >
                  <Typography component="span" sx={{ fontSize: 18 }}>
                    {reactionEmojis[reaction as HubReactionType]}
                  </Typography>
                </IconButton>
              ))}
            </Box>
            {poll.viewerReaction && <MenuItem onClick={handleRemoveReaction}>Remove reaction</MenuItem>}
          </Menu>
          {commentsOpen && (
            <Stack spacing={1.5}>
              <Divider />
              {commentsLoading ? (
                <CircularProgress size={20} />
              ) : comments.length ? (
                comments.map((comment) => (
                  <Stack key={comment.id} direction="row" spacing={1.5} alignItems="flex-start">
                    <Avatar src={comment.author.user.profilePhotoUrl || undefined} alt={getHubAuthorName(comment.author.user, 'Member')} sx={{ width: 32, height: 32 }}>
                      {!comment.author.user.profilePhotoUrl && getHubAuthorName(comment.author.user, 'Member').charAt(0)}
                    </Avatar>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {formatHubAuthorLabel(comment.author.user, comment.author.role, 'Member')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatHubDate(comment.createdAt)}
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {comment.body}
                      </Typography>
                    </Box>
                  </Stack>
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No comments yet.
                </Typography>
              )}
              <Paper sx={{ p: '2px 4px', display: 'flex', alignItems: 'center', borderRadius: 5, border: '1px solid', borderColor: 'grey.300', boxShadow: 'none' }}>
                <InputBase
                  sx={{ ml: 1, flex: 1 }}
                  placeholder="Write a comment..."
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                />
                <IconButton onClick={handleSubmitComment} disabled={!commentDraft.trim()}>
                  <SendIcon />
                </IconButton>
              </Paper>
              {commentError && <Alert severity="error">{commentError}</Alert>}
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

interface EditPostDialogProps {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  error?: string | null;
}

function EditPostDialog({ open, value, onChange, onClose, onSave, saving, error }: EditPostDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Edit Post</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          multiline
          minRows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          placeholder="Update your post..."
        />
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={onSave}
          variant="contained"
          disabled={saving || !value.trim()}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}


// --- Start Poll Modal Component ---
interface StartPollModalProps {
  onClose: () => void;
  onCreate: (pollData: { question: string; options: string[] }) => Promise<void> | void;
  submitting?: boolean;
  error?: string | null;
  editingPoll?: HubPoll | null;
}

function StartPollModal({ onClose, onCreate, submitting = false, error, editingPoll }: StartPollModalProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);

  useEffect(() => {
    if (editingPoll) {
      setQuestion(editingPoll.question || '');
      const sortedOptions = editingPoll.options
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((opt) => opt.label);
      setOptions(sortedOptions.length ? sortedOptions : ['', '']);
    } else {
      setQuestion('');
      setOptions(['', '']);
    }
  }, [editingPoll]);

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const addOption = () => {
    if (options.length < 5) {
      setOptions([...options, '']);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pollData = {
      question,
      options: options.filter(opt => opt.trim() !== ''),
    };
    if (pollData.question.trim() && pollData.options.length >= 2) {
      await onCreate(pollData);
      setQuestion('');
      setOptions(['', '']);
    }
  };

  return (
    <Dialog open onClose={submitting ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">{editingPoll ? 'Edit Poll' : 'Start a New Poll'}</Typography>
          <IconButton onClick={onClose} size="small" disabled={submitting}>
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {submitting ? (
          <SubmissionStatusNotice
            message={editingPoll ? 'Updating your poll. Please wait and keep this window open.' : 'Creating your poll. Please wait and keep this window open.'}
          />
        ) : null}
        <TextField
          autoFocus
          margin="dense"
          id="pollQuestion"
          label="Poll Question"
          type="text"
          fullWidth
          variant="outlined"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g., What's for lunch?"
          sx={{ mb: 3, '& .MuiOutlinedInput-root': { borderRadius: 1 } }}
          disabled={submitting}
        />

        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'medium' }}>Options</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {options.map((option, index) => (
            <TextField
              key={index}
              fullWidth
              variant="outlined"
              value={option}
              onChange={(e) => handleOptionChange(index, e.target.value)}
              placeholder={`Option ${index + 1}`}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1 } }}
              disabled={submitting}
            />
          ))}
        </Box>
        {options.length < 5 && (
          <Button
            onClick={addOption}
            startIcon={<AddCircleOutlineIcon sx={{ fontSize: 16 }} />}
            sx={{ mt: 2, textTransform: 'none', color: 'primary.main', '&:hover': { bgcolor: 'primary.light' } }} // Use AddCircleOutlineIcon for PlusCircle
            disabled={submitting}
          >
            Add Option
          </Button>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} variant="outlined" sx={{ textTransform: 'none' }} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={
            submitting ||
            !question.trim() ||
            options.filter(opt => opt.trim() !== '').length < 2
          }
          sx={{ textTransform: 'none', bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}
        >
          {submitting ? (editingPoll ? 'Updating...' : 'Creating...') : editingPoll ? 'Update Poll' : 'Create Poll'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}



