import { FC, useMemo, useState } from 'react';
import { Avatar, Box, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import { Copy, FileText, MessageCircle, Pencil, Pin, PinOff, SmilePlus, Trash2 } from 'lucide-react';
import type { ChatMessage, UserLite } from './types';
import { downloadChatAttachment } from '@chemisttasker/shared-core';
import {
  EMOJI_FONT,
  REACTIONS,
  fullTimestamp,
  initialsOf,
  isEmojiOnly,
  renderRichText,
  timeLabel,
  type GroupPosition,
} from './chatFormat';

/** Only the backend-issued, message-ID-bound route is accepted. Never
 * navigate to FileField storage URLs or Azure SAS links from chat payloads.
 */
export const safeChatAttachmentHref = (raw: string | null | undefined, messageId?: number): string | null => {
  if (!raw || !Number.isSafeInteger(messageId) || !messageId || messageId < 1) return null;
  return raw === `/api/v1/messages/${messageId}/attachment/` ? raw : null;
};


const REACTION_NAMES: Record<string, string> = { '👍': 'Thumbs up', '❤️': 'Heart', '🔥': 'Fire', '💩': 'Poop' };

type Props = {
  msg: ChatMessage;
  isMe: boolean;
  isGroupRoom: boolean;
  position: GroupPosition;
  currentUserId?: number;
  onStartDm: (partnerMembershipId: number) => void;
  onRequestEdit: (message: ChatMessage) => void;
  onRequestDelete: (message: ChatMessage) => void;
  onReact: (messageId: number, reaction: string) => void;
  onTogglePin: (target: 'conversation' | 'message', messageId?: number) => void;
  innerRef?: (node: HTMLDivElement | null) => void;
  resolveMemberDetails?: (membershipId: number | null) => UserLite | null;
  resolveUserName?: (userId: number) => string | null;
};

const ToolButton: FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({ label, onClick, children }) => (
  <Tooltip title={label}>
    <IconButton
      aria-label={label}
      onClick={(event) => { event.stopPropagation(); onClick(); }}
      sx={{ width: 32, height: 32, color: 'var(--chat-muted)', '&:hover': { color: 'var(--chat-text)', bgcolor: 'var(--chat-hover)' } }}
    >
      {children}
    </IconButton>
  </Tooltip>
);

export const MessageBubble: FC<Props> = ({
  msg,
  isMe: isMine,
  isGroupRoom,
  position,
  currentUserId,
  onStartDm,
  onRequestEdit,
  onRequestDelete,
  onReact,
  onTogglePin,
  innerRef,
  resolveMemberDetails,
  resolveUserName,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');

  const groupedReactions = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean; userIds: number[] }>();
    (msg.reactions || []).forEach((r) => {
      const entry = map.get(r.reaction) || { count: 0, mine: false, userIds: [] };
      entry.count += 1;
      entry.userIds.push(r.user_id);
      if (currentUserId && r.user_id === currentUserId) entry.mine = true;
      map.set(r.reaction, entry);
    });
    return Array.from(map.entries());
  }, [msg.reactions, currentUserId]);

  const sender = msg.sender;
  const user = sender?.user_details;
  const isMe = Boolean(sender && isMine);
  const fallback = sender && resolveMemberDetails ? resolveMemberDetails(sender.id) : null;
  const photo = user?.profile_photo_url || fallback?.profile_photo_url || null;
  const first = user?.first_name || fallback?.first_name;
  const last = user?.last_name || fallback?.last_name;
  const fullName = sender ? `${first || ''} ${last || ''}`.trim() || `Member ${sender.id}` : 'Former member';
  const fileName = msg.attachment_filename || (msg.attachment_url ? decodeURIComponent(msg.attachment_url.split('/').pop() || '') : 'Attachment');
  const attachmentHref = safeChatAttachmentHref(msg.attachment_url, msg.id);
  const saveAttachment = async () => {
    if (!attachmentHref || attachmentBusy) return;
    setAttachmentBusy(true);
    setAttachmentError('');
    try {
      const file = await downloadChatAttachment(msg.id);
      const objectUrl = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = (fileName || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // An object URL must not outlive the browser's download hand-off.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      setAttachmentError('Attachment unavailable. Check your access and retry.');
    } finally {
      setAttachmentBusy(false);
    }
  };

  const startsGroup = position === 'single' || position === 'first';
  const endsGroup = position === 'single' || position === 'last';
  const showName = !isMe && (isGroupRoom || !sender) && startsGroup;
  const emojiOnly = !msg.is_deleted && !msg.attachment_url && isEmojiOnly(msg.body);

  // Chained corners: the side facing the sender's avatar tightens between grouped messages.
  const big = 18;
  const tight = 5;
  const radius = (() => {
    const top = position === 'middle' || position === 'last' ? tight : big;
    const bottom = position === 'middle' || position === 'first' ? tight : big;
    return isMe ? `${big}px ${top}px ${bottom}px ${big}px` : `${top}px ${big}px ${big}px ${bottom}px`;
  })();

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(msg.body || '');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable: nothing to do */
    }
  };

  const reactorNames = (userIds: number[]) =>
    userIds
      .map((id) => (currentUserId && id === currentUserId ? 'You' : resolveUserName?.(id) || null))
      .filter(Boolean)
      .join(', ');

  const toolbar = !msg.is_deleted && (
    <Paper
      className="msg-toolbar"
      elevation={0}
      sx={{
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        [isMe ? 'right' : 'left']: '100%',
        mx: 0.75,
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
        p: 0.25,
        borderRadius: '12px',
        border: '1px solid var(--chat-border)',
        bgcolor: 'var(--chat-surface)',
        boxShadow: '0 6px 18px rgba(6, 18, 58, 0.10)',
        zIndex: 3,
        flexDirection: isMe ? 'row-reverse' : 'row',
      }}
    >
      <ToolButton label="React" onClick={() => setPickerOpen((open) => !open)}><SmilePlus size={17} /></ToolButton>
      {msg.body && <ToolButton label={copied ? 'Copied' : 'Copy text'} onClick={copyText}><Copy size={16} /></ToolButton>}
      <ToolButton label={msg.is_pinned ? 'Unpin message' : 'Pin message'} onClick={() => onTogglePin('message', msg.id)}>
        {msg.is_pinned ? <PinOff size={16} /> : <Pin size={16} />}
      </ToolButton>
      {isMe ? (
        <>
          {msg.body && <ToolButton label="Edit message" onClick={() => onRequestEdit(msg)}><Pencil size={16} /></ToolButton>}
          <ToolButton label="Delete message" onClick={() => onRequestDelete(msg)}><Trash2 size={16} /></ToolButton>
        </>
      ) : sender && (
        <ToolButton label={`Message ${first || fullName} privately`} onClick={() => onStartDm(sender.id)}><MessageCircle size={16} /></ToolButton>
      )}
      {pickerOpen && (
        <Paper
          elevation={0}
          role="group"
          aria-label="Choose a reaction"
          sx={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            [isMe ? 'right' : 'left']: 0,
            display: 'flex',
            gap: 0.25,
            p: 0.5,
            borderRadius: '999px',
            border: '1px solid var(--chat-border)',
            bgcolor: 'var(--chat-surface)',
            boxShadow: '0 8px 24px rgba(6, 18, 58, 0.14)',
          }}
        >
          {REACTIONS.map((emoji) => (
            <IconButton
              key={emoji}
              aria-label={`React with ${REACTION_NAMES[emoji] || emoji}`}
              onClick={(event) => { event.stopPropagation(); onReact(msg.id, emoji); setPickerOpen(false); }}
              sx={{ width: 40, height: 40, fontSize: 22, fontFamily: EMOJI_FONT, transition: 'transform .12s', '&:hover': { transform: 'scale(1.18)', bgcolor: 'transparent' } }}
            >
              {emoji}
            </IconButton>
          ))}
        </Paper>
      )}
    </Paper>
  );

  return (
    <Box
      ref={innerRef}
      className={`msg-row ${isMe ? 'me' : ''} ${pinnedOpen || pickerOpen ? 'actions-open' : ''}`}
      onMouseLeave={() => { setPickerOpen(false); setPinnedOpen(false); }}
      sx={{ mt: startsGroup ? 1.5 : '2px', alignItems: 'flex-end', gap: 1 }}
    >
      {!isMe && (
        <Box sx={{ width: 32, flexShrink: 0 }}>
          {endsGroup && sender && (
            <Avatar
              src={photo || undefined}
              alt={fullName}
              sx={{ width: 32, height: 32, fontSize: 12, fontWeight: 600, bgcolor: photo ? 'transparent' : 'var(--ct-tone-violet-bg)', color: photo ? 'inherit' : 'var(--ct-tone-violet-fg)' }}
            >
              {!photo ? initialsOf(first, last, fullName) : null}
            </Avatar>
          )}
        </Box>
      )}

      <Box sx={{ minWidth: 0, maxWidth: { xs: '82%', md: '68%' }, display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
        {showName && (
          <Typography variant="caption" sx={{ px: 1.5, mb: 0.25, fontWeight: 600, color: 'var(--chat-muted)' }}>
            {fullName}
          </Typography>
        )}

        <Box
          sx={{ position: 'relative', maxWidth: '100%' }}
          title={fullTimestamp(msg.created_at)}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a,button')) return;
            setPinnedOpen((open) => !open);
          }}
        >
          {msg.is_deleted ? (
            <Box className="bubble deleted" sx={{ borderRadius: radius }}>
              <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                {isMe ? 'You deleted a message' : 'This message was deleted'}
              </Typography>
            </Box>
          ) : emojiOnly ? (
            <Box sx={{ fontSize: 40, lineHeight: 1.15, fontFamily: EMOJI_FONT, py: 0.25 }}>{msg.body.trim()}</Box>
          ) : (
            <Box className={`bubble ${isMe ? 'me' : ''}`} sx={{ borderRadius: radius }}>
              {msg.attachment_url && (
                <Box sx={{ mb: msg.body ? 1 : 0 }}>
                  {!attachmentHref ? (
                    <Typography role="status" variant="body2">Attachment unavailable</Typography>
                  ) : (
                    <Box component="button" type="button" onClick={() => void saveAttachment()}
                      disabled={attachmentBusy}
                      aria-label={`Download attachment ${fileName}`}
                      sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 1,
                        borderRadius: '12px', border: '1px solid var(--chat-border)',
                        color: 'inherit', bgcolor: 'var(--chat-canvas)', cursor: 'pointer',
                        font: 'inherit', maxWidth: '100%' }}>
                      <FileText size={18} />
                      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                        {attachmentBusy ? 'Downloading securely…' : fileName}
                      </Typography>
                    </Box>
                  )}
                  {attachmentError && <Typography role="alert" variant="caption">{attachmentError}</Typography>}
                </Box>
              )}
              {msg.body && (
                <Typography variant="body2" component="div" sx={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.45 }}>
                  {renderRichText(msg.body, isMe ? 'me' : 'them')}
                </Typography>
              )}
            </Box>
          )}
          {toolbar}
        </Box>

        {groupedReactions.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: '-6px', px: 1, position: 'relative', zIndex: 1, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
            {groupedReactions.map(([emoji, info]) => {
              const names = reactorNames(info.userIds);
              return (
                <Tooltip key={emoji} title={names ? `${REACTION_NAMES[emoji] || emoji}: ${names}` : (REACTION_NAMES[emoji] || emoji)}>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => onReact(msg.id, emoji)}
                    aria-pressed={info.mine}
                    aria-label={`${REACTION_NAMES[emoji] || emoji}, ${info.count}${info.mine ? ', including you' : ''}`}
                    sx={{
                      display: 'inline-flex', alignItems: 'center', gap: 0.5, height: 24, px: 0.875, cursor: 'pointer',
                      borderRadius: '999px', font: 'inherit', fontSize: 12, fontWeight: 600,
                      color: info.mine ? 'var(--ct-accent-strong)' : 'var(--chat-text)',
                      bgcolor: info.mine ? 'var(--ct-tone-violet-bg)' : 'var(--chat-surface)',
                      border: info.mine ? '1px solid var(--ct-accent-strong)' : '1px solid var(--chat-border)',
                      boxShadow: '0 1px 3px rgba(6, 18, 58, 0.10)',
                    }}
                  >
                    <span style={{ fontFamily: EMOJI_FONT, fontSize: 14, lineHeight: 1 }}>{emoji}</span>
                    {info.count > 1 && <span>{info.count}</span>}
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
        )}

        {endsGroup && (
          <Box className="msg-meta" sx={{ px: 1, textAlign: isMe ? 'right' : 'left' }}>
            {timeLabel(msg.created_at)}
            {msg.is_pinned && ' · pinned'}
            {msg.is_edited && !msg.is_deleted && (
              <Tooltip title={msg.original_body ? `Original: ${msg.original_body}` : 'Edited'}>
                <span> · edited</span>
              </Tooltip>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};
