import { Avatar, Box, IconButton, Tooltip, Typography } from '@mui/material';
import { ArrowLeft, Pin, PinOff } from 'lucide-react';
import type { ChatRoom } from './types';
import { initialsOf } from './chatFormat';

/** Conversation title, who is in it or who is typing, and the pin toggle. */
export function ConversationHeader({
  title,
  statusLine,
  statusIsTyping,
  isMobile,
  onBack,
  isPinned,
  onTogglePin,
}: {
  title: string;
  statusLine: string;
  statusIsTyping: boolean;
  isMobile: boolean;
  onBack: () => void;
  isPinned: boolean;
  onTogglePin: () => void;
}) {
  return (
    <Box className="conversation-header" sx={{ position: 'sticky', top: 0, zIndex: 2, gap: 1.25 }}>
      {isMobile && (
        <IconButton onClick={onBack} aria-label="Back to conversations" sx={{ width: 40, height: 40, ml: -0.5 }}>
          <ArrowLeft size={20} />
        </IconButton>
      )}
      <Avatar sx={{ width: 40, height: 40, fontSize: 14, fontWeight: 600, bgcolor: 'var(--ct-tone-violet-bg)', color: 'var(--ct-tone-violet-fg)' }}>
        {initialsOf(null, null, title)}
      </Avatar>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography component="h2" noWrap title={title} sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 18, lineHeight: 1.25, color: 'var(--chat-text)' }}>
          {title}
        </Typography>
        <Typography variant="body2" noWrap aria-live="polite" sx={{ color: statusIsTyping ? 'var(--ct-accent-strong)' : 'var(--chat-muted)', fontSize: 13 }}>
          {statusLine}
        </Typography>
      </Box>
      <Tooltip title={isPinned ? 'Unpin conversation' : 'Pin conversation'}>
        <IconButton
          aria-label={isPinned ? 'Unpin conversation' : 'Pin conversation'}
          aria-pressed={isPinned}
          onClick={onTogglePin}
          sx={{ width: 40, height: 40, color: isPinned ? 'var(--ct-accent-strong)' : 'var(--chat-muted)' }}
        >
          <Pin size={18} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

/** The pinned message under the header: jump to it, or unpin it. */
export function PinnedMessageBar({ pinned, onJump, onUnpin }: { pinned: NonNullable<ChatRoom['pinned_message']>; onJump: () => void; onUnpin: () => void }) {
  return (
    <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1, borderBottom: '1px solid var(--chat-border)', bgcolor: 'var(--chat-surface)' }}>
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 1, borderRadius: '12px', bgcolor: 'var(--ct-tone-violet-bg)', border: '1px solid color-mix(in srgb, var(--ct-accent-strong) 18%, transparent)' }}
      >
        <Box sx={{ color: 'var(--ct-accent-strong)', display: 'flex' }} aria-hidden><Pin size={16} /></Box>
        <Box
          role="button"
          tabIndex={0}
          onClick={onJump}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onJump(); } }}
          sx={{ minWidth: 0, flex: 1, cursor: 'pointer', borderRadius: '8px', '&:focus-visible': { outline: '2px solid var(--ct-accent-strong)', outlineOffset: 2 } }}
          aria-label="Go to pinned message"
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--ct-accent-strong)', fontSize: 12.5 }}>Pinned message</Typography>
          <Typography variant="body2" noWrap sx={{ color: 'var(--chat-text)' }}>{pinned.body || 'Attachment'}</Typography>
        </Box>
        <Tooltip title="Unpin message">
          <IconButton aria-label="Unpin message" onClick={onUnpin} sx={{ width: 36, height: 36, color: 'var(--ct-accent-strong)' }}>
            <PinOff size={16} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
