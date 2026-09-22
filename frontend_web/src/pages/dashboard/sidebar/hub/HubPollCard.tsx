import React, { useState } from 'react';
import {
  Alert,
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
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SendIcon from '@mui/icons-material/Send';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';
import ThumbUpAltOutlinedIcon from '@mui/icons-material/ThumbUpAltOutlined';

import {
  createHubPollComment,
  fetchHubPollComments,
  reactToHubPoll,
  removeHubPollReaction,
} from '../../../../api/hub';
import type {
  HubComment,
  HubPoll,
  HubReactionType,
} from '../../../../types/hub';
import {
  formatHubAuthorLabel,
  formatHubDate,
  getHubAuthorName,
} from './hubUtils';
import {
  reactionEmojis,
  getErrorMessage,
} from './HubFeed.helpers';

export interface PollCardProps {
  poll: HubPoll;
  onUpdate: (poll: HubPoll) => void;
  onVote: (pollId: number, optionId: number) => void;
  onEdit?: (poll: HubPoll) => void;
  onDelete?: (poll: HubPoll) => void;
}

export function PollCard({ poll, onUpdate, onVote, onEdit, onDelete }: PollCardProps) {
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
