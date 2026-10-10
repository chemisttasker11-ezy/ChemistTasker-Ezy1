import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  CircularProgress,
  FormHelperText,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import SendIcon from '@mui/icons-material/Send';

import { Avatar, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Popover, Skeleton, Tooltip } from '@mui/material';
import { BarChart3, ImagePlus, MessagesSquare, Smile, Tag, X } from 'lucide-react';
import DashboardContentState from '../../../../components/dashboard/DashboardContentState';
import { COMPOSER_EMOJI, EMOJI_FONT, initialsOf } from '../../../../components/social/socialFormat';
import {
  createHubPoll,
  createHubPost,
  deleteHubPoll,
  deleteHubPost,
  fetchHubPolls,
  fetchHubPosts,
  updateHubPoll,
  updateHubPost,
  voteHubPoll,
} from '../../../../api/hub';
import type {
  HubGroupMemberOption,
  HubPoll,
  HubPost,
  HubPostPayload,
  HubScopeSelection,
} from '../../../../types/hub';
import { useAuth } from '../../../../contexts/AuthContext';
import { formatMemberLabel, getMemberDisplayName } from './hubUtils';
import {
  getErrorMessage,
  useSubmissionGuard,
  SubmissionStatusNotice,
} from './HubFeed.helpers';
import { EditPostDialog, StartPollModal } from './HubFeedDialogs';
import { PostCard } from './HubPostCard';
import { PollCard } from './HubPollCard';

interface ScopeFeedProps {
  scope: HubScopeSelection;
  canCreatePost: boolean;
  membersLoader?: () => Promise<HubGroupMemberOption[]>;
  emptyTitle: string;
  emptyDescription: string;
  /** Name of the space, used in "Write something to …". */
  audienceName?: string;
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
  audienceName,
  targetPostId,
  onTargetPostHandled,
}: ScopeFeedProps) {
  const { user } = useAuth();
  const [composerOpen, setComposerOpen] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HubPost | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const meName = `${(user as any)?.first_name || ''} ${(user as any)?.last_name || ''}`.trim() || (user as any)?.username || '';
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
    // Pinned posts lead, like a group's featured posts; everything else is newest first.
    const pinnedFirst = (entry: FeedItem) => (entry.kind === 'post' && entry.item.isPinned ? 1 : 0);
    return [...postItems, ...pollItems].sort((a, b) => pinnedFirst(b) - pinnedFirst(a) || b.sortAt - a.sortAt);
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
          setPostsError("We couldn't load the posts.");
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
  }, [stableScope, loadAttempt]);

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
          setPollsError("Polls didn't load. Posts are still shown.");
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
      setShowTags(false);
      setComposerOpen(false);
    } catch (err) {
      console.error('Failed to create post:', err);
      setComposerError(`${getErrorMessage(err, "Your post wasn't published.")} Your text is still here, so you can try again.`);
    } finally {
      composerGuard.finish();
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) {
      return;
    }
    addFiles(Array.from(files));
    event.target.value = '';
  };

  const addFiles = (files: File[]) => {
    if (!files.length) return;
    setAttachments((prev) => [...prev, ...files.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))]);
    setComposerOpen(true);
    setComposerError(null);
  };

  const attachmentPreviews = useMemo(
    () => attachments.map((file) => ({ file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null })),
    [attachments],
  );
  useEffect(() => () => attachmentPreviews.forEach((p) => p.url && URL.revokeObjectURL(p.url)), [attachmentPreviews]);

  const insertEmoji = (emoji: string) => {
    const input = composerInputRef.current;
    const start = input?.selectionStart ?? postContent.length;
    const end = input?.selectionEnd ?? postContent.length;
    setPostContent(`${postContent.slice(0, start)}${emoji}${postContent.slice(end)}`);
    setEmojiAnchor(null);
    window.setTimeout(() => {
      if (input) { input.focus(); const caret = start + emoji.length; input.setSelectionRange(caret, caret); }
    }, 0);
  };

  const openComposer = (withTags = false) => {
    setComposerOpen(true);
    if (withTags) setShowTags(true);
    window.setTimeout(() => composerInputRef.current?.focus(), 0);
  };

  const cancelComposer = () => {
    setComposerOpen(false);
    setShowTags(false);
    setComposerError(null);
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

  const handleDeletePost = (post: HubPost) => setDeleteTarget(post);

  const confirmDeletePost = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteHubPost(deleteTarget.id);
      setPosts((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete post:', err);
      setComposerError("We couldn't delete that post. Try again.");
      setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
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
          variant="outlined"
          onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragActive(true); } }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setDragActive(false); }}
          onDrop={(e) => { e.preventDefault(); setDragActive(false); addFiles(Array.from(e.dataTransfer?.files || [])); }}
          sx={{
            position: 'relative',
            borderRadius: 'var(--ct-card-radius)',
            borderColor: dragActive ? 'var(--ct-accent-strong)' : 'var(--ct-border-color)',
            borderStyle: dragActive ? 'dashed' : 'solid',
            bgcolor: 'var(--ct-surface-bg)',
            boxShadow: 'none',
            p: { xs: 1.75, md: 2 },
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems={composerOpen ? 'flex-start' : 'center'}>
            <Avatar sx={{ width: 44, height: 44, fontSize: 15, fontWeight: 600, bgcolor: 'var(--ct-tone-violet-bg)', color: 'var(--ct-tone-violet-fg)' }}>
              {initialsOf((user as any)?.first_name, (user as any)?.last_name, meName || 'Me')}
            </Avatar>
            {!composerOpen ? (
              <ButtonBase
                onClick={() => openComposer()}
                aria-label={`Write a post to ${audienceName || 'this hub'}`}
                sx={{
                  flex: 1, justifyContent: 'flex-start', minHeight: 48, px: 2, borderRadius: '999px', textAlign: 'left',
                  bgcolor: 'var(--ct-subtle-bg)', border: '1px solid var(--ct-border-color)', color: 'var(--ct-text-secondary)', fontSize: 15,
                  '&:hover': { borderColor: 'var(--ct-accent-strong)' },
                  '&.Mui-focusVisible': { outline: '2px solid var(--ct-accent-strong)', outlineOffset: 2 },
                }}
              >
                Write something to {audienceName || 'the team'}…
              </ButtonBase>
            ) : (
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--ct-text-primary)', mb: 0.75 }}>
                  {meName || 'You'}
                  <Box component="span" sx={{ fontWeight: 400, color: 'var(--ct-text-secondary)' }}> · posting to {audienceName || 'this hub'}</Box>
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  minRows={3}
                  maxRows={14}
                  placeholder="Share an update, a reminder or a shout-out…"
                  value={postContent}
                  inputRef={composerInputRef}
                  inputProps={{ 'aria-label': 'Post text', maxLength: 10000 }}
                  onPaste={(e) => {
                    const files = Array.from(e.clipboardData?.files || []);
                    if (files.length) { e.preventDefault(); addFiles(files); }
                  }}
                  onChange={(e) => {
                    setPostContent(e.target.value);
                    if (composerError) setComposerError(null);
                  }}
                  disabled={composerGuard.submitting}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '14px', bgcolor: 'var(--ct-surface-bg)', fontSize: 15 } }}
                />
              </Box>
            )}
          </Stack>

          {composerOpen && composerError && (
            <Alert severity="error" sx={{ mt: 1.5 }} onClose={() => setComposerError(null)}>{composerError}</Alert>
          )}

          {composerOpen && attachmentPreviews.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5, pl: { sm: 7 } }} aria-label="Attachments to post">
              {attachmentPreviews.map(({ file, url }) => (
                <Box key={`${file.name}-${file.size}`} sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 1, height: 72, maxWidth: 260, pr: url ? 0 : 1.25, pl: url ? 0 : 1, borderRadius: '12px', border: '1px solid var(--ct-border-color)', bgcolor: 'var(--ct-subtle-bg)', overflow: 'hidden' }}>
                  {url ? (
                    <img src={url} alt={file.name} style={{ width: 72, height: 72, objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <>
                      <InsertDriveFileIcon sx={{ color: 'var(--ct-accent-strong)' }} />
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600, color: 'var(--ct-text-primary)', maxWidth: 170 }}>{file.name}</Typography>
                    </>
                  )}
                  <IconButton
                    aria-label={`Remove ${file.name}`}
                    onClick={() => removeAttachment(file)}
                    disabled={composerGuard.submitting}
                    sx={{ position: url ? 'absolute' : 'static', top: 2, right: 2, width: 26, height: 26, bgcolor: 'rgba(6,18,58,0.72)', color: '#fff', '&:hover': { bgcolor: 'rgba(6,18,58,0.9)' } }}
                  >
                    <X size={14} />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}

          {composerOpen && showTags && membersLoader && (
            <Box sx={{ mt: 1.5, pl: { sm: 7 } }}>
              <TagMembersSelector loadMembers={membersLoader} value={taggedMembers} onChange={setTaggedMembers} disabled={composerGuard.submitting} />
            </Box>
          )}

          <input type="file" multiple ref={fileInputRef} onChange={handleFileSelect} disabled={composerGuard.submitting} style={{ display: 'none' }} />
          {composerGuard.submitting ? <SubmissionStatusNotice message="Posting your update. Keep this window open." /> : null}

          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            flexWrap="wrap"
            useFlexGap
            spacing={1}
            sx={{ mt: 1.5, pt: 1.25, borderTop: '1px solid var(--ct-border-color)' }}
          >
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              <Button onClick={() => fileInputRef.current?.click()} startIcon={<ImagePlus size={18} />} disabled={composerGuard.submitting} sx={{ minHeight: 40, color: 'var(--ct-text-secondary)' }}>
                Photo or file
              </Button>
              {membersLoader && (
                <Button
                  onClick={() => (composerOpen ? setShowTags((v) => !v) : openComposer(true))}
                  startIcon={<Tag size={17} />}
                  disabled={composerGuard.submitting}
                  aria-pressed={showTags}
                  sx={{ minHeight: 40, color: showTags ? 'var(--ct-accent-strong)' : 'var(--ct-text-secondary)' }}
                >
                  Tag people{taggedMembers.length ? ` (${taggedMembers.length})` : ''}
                </Button>
              )}
              <Button onClick={() => openPollModal()} startIcon={<BarChart3 size={17} />} disabled={composerGuard.submitting} sx={{ minHeight: 40, color: 'var(--ct-text-secondary)' }}>
                Poll
              </Button>
              {composerOpen && (
                <Tooltip title="Emoji">
                  <IconButton aria-label="Insert emoji" onClick={(e) => setEmojiAnchor(e.currentTarget)} sx={{ width: 40, height: 40, color: 'var(--ct-text-secondary)' }}>
                    <Smile size={18} />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
            {composerOpen && (
              <Stack direction="row" spacing={1}>
                <Button onClick={cancelComposer} disabled={composerGuard.submitting} sx={{ minHeight: 40 }}>Cancel</Button>
                <Button
                  onClick={handleCreatePost}
                  disabled={composerGuard.submitting || (!postContent.trim() && attachments.length === 0)}
                  variant="contained"
                  startIcon={composerGuard.submitting ? <CircularProgress size={16} color="inherit" /> : <SendIcon sx={{ fontSize: 16 }} />}
                  sx={{ minHeight: 40 }}
                >
                  Post
                </Button>
              </Stack>
            )}
          </Stack>
          <Popover
            open={Boolean(emojiAnchor)}
            anchorEl={emojiAnchor}
            onClose={() => setEmojiAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            slotProps={{ paper: { sx: { borderRadius: '16px', p: 1, mt: 0.5 } } }}
          >
            <Box role="group" aria-label="Emoji" sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 40px)', gap: 0.25 }}>
              {COMPOSER_EMOJI.map((emoji) => (
                <IconButton key={emoji} aria-label={`Insert ${emoji}`} onClick={() => insertEmoji(emoji)} sx={{ width: 40, height: 40, fontSize: 22, fontFamily: EMOJI_FONT }}>
                  {emoji}
                </IconButton>
              ))}
            </Box>
          </Popover>
        </Card>
      )}

      {pollsError && !postsError ? <Alert severity="warning">{pollsError}</Alert> : null}

      {postsError && feedItems.length === 0 ? (
        <DashboardContentState kind="error" title={postsError} description="Check your connection and try again." actionLabel="Try again" onAction={() => setLoadAttempt((n) => n + 1)} />
      ) : (loadingPosts || pollsLoading) && feedItems.length === 0 ? (
        <Stack spacing={2} aria-busy="true" aria-label="Loading posts">
          {[0, 1].map((i) => (
            <Card key={i} variant="outlined" sx={{ borderRadius: 'var(--ct-card-radius)', borderColor: 'var(--ct-border-color)', boxShadow: 'none', p: 2.25 }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Skeleton variant="circular" width={44} height={44} />
                <Box sx={{ flex: 1 }}><Skeleton width="40%" /><Skeleton width="20%" /></Box>
              </Stack>
              <Skeleton sx={{ mt: 2 }} /><Skeleton width="85%" /><Skeleton width="60%" />
            </Card>
          ))}
        </Stack>
      ) : feedItems.length > 0 ? (
        <Stack spacing={2}>
          {postsError ? <Alert severity="error">{postsError}</Alert> : null}
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
        <DashboardContentState
          kind="empty"
          icon={<MessagesSquare size={26} />}
          title={emptyTitle}
          description={emptyDescription}
          actionLabel={canCreatePost ? 'Write a post' : undefined}
          onAction={canCreatePost ? () => openComposer() : undefined}
        />
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
      <Dialog open={Boolean(deleteTarget)} onClose={deleteBusy ? undefined : () => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete this post?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">It's removed for everyone, with its comments and reactions. You can't undo this.</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => void confirmDeletePost()} disabled={deleteBusy} startIcon={deleteBusy ? <CircularProgress size={16} color="inherit" /> : undefined}>Delete post</Button>
        </DialogActions>
      </Dialog>
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
  /** Loads the hub member directory (names only, own pharmacy first); `search` is applied on the server. */
  loadMembers?: (search?: string) => Promise<HubGroupMemberOption[]>;
  value: HubGroupMemberOption[];
  onChange: (members: HubGroupMemberOption[]) => void;
  disabled?: boolean;
}

type AggregatedMemberOption = {
  key: string;
  fullName: string;
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
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    let isMounted = true;
    if (!loadMembers) {
      setOptions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadMembers(search || undefined)
      .then((members) => {
        if (isMounted) {
          const found = filterPharmacyStaffMembers(members).filter(
            (member) => user?.id == null || member.userId !== user.id,
          );
          // Keep already-selected members available while a search narrows the list.
          const seen = new Set(found.map((member) => member.membershipId));
          setOptions([...found, ...value.filter((member) => !seen.has(member.membershipId))]);
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
    // `value` is read only to keep selections visible; reloading on every selection is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMembers, search, user?.id]);

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
        if (!entry.jobTitle && member.jobTitle) {
          entry.jobTitle = member.jobTitle;
        }
      } else {
        map.set(key, {
          key,
          fullName: getMemberDisplayName(member),
          role: member.role,
          jobTitle: member.jobTitle ?? null,
          membershipIds: [member.membershipId],
          pharmacyNames: member.pharmacyName ? [member.pharmacyName] : [],
        });
      }
    });
    // The directory already orders the viewer's own pharmacy first, then by pharmacy and name.
    return Array.from(map.values());
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
        inputValue={searchInput}
        onInputChange={(_, next, reason) => {
          if (reason !== 'reset') setSearchInput(next);
        }}
        filterOptions={(list) => list}
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
