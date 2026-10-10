import { Fragment, useMemo, type ComponentProps, type MutableRefObject, type UIEvent } from 'react';
import { Avatar, Box, Button, CircularProgress, Typography } from '@mui/material';
import { ArrowDown } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage, UserLite } from './types';
import { EMOJI_FONT, dayLabel, initialsOf, layoutMessages } from './chatFormat';

type BubbleActions = Pick<ComponentProps<typeof MessageBubble>, 'onStartDm' | 'onReact' | 'onTogglePin' | 'resolveUserName' | 'currentUserId'>;

/** The scrolling message log: loaders, empty state, day separators, "New messages", bubbles and the typing bubble. */
export function ConversationMessageList({
  title,
  isGroupRoom,
  messages,
  firstUnreadIndex,
  isLoadingMessages,
  isLoadingMore,
  hasMore,
  typing,
  scrollRef,
  onScroll,
  showJump,
  unseenCount,
  onJumpToLatest,
  onWave,
  isMessageFromMe,
  resolveMemberDetailsForMessage,
  onRequestEdit,
  onRequestDelete,
  registerMessage,
  bubbleActions,
}: {
  title: string;
  isGroupRoom: boolean;
  messages: ChatMessage[];
  firstUnreadIndex: number;
  isLoadingMessages: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  typing: boolean;
  scrollRef: MutableRefObject<HTMLDivElement | null>;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  showJump: boolean;
  unseenCount: number;
  onJumpToLatest: () => void;
  onWave: () => void;
  isMessageFromMe: (message: ChatMessage) => boolean;
  resolveMemberDetailsForMessage: (message: ChatMessage) => UserLite | null;
  onRequestEdit: (message: ChatMessage) => void;
  onRequestDelete: (message: ChatMessage) => void;
  registerMessage: (id: number, el: HTMLDivElement | null) => void;
  bubbleActions: BubbleActions;
}) {
  const layout = useMemo(() => layoutMessages(messages), [messages]);
  return (
    <Box sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box ref={scrollRef} className="conversation-scroll" onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions" aria-label={`Messages in ${title}`}>
        {isLoadingMore && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderRadius: '999px', bgcolor: 'var(--chat-surface)', border: '1px solid var(--chat-border)', fontSize: 12.5, color: 'var(--chat-muted)' }}>
              <CircularProgress size={14} /> Loading earlier messages
            </Box>
          </Box>
        )}
        {!hasMore && messages.length > 0 && !isLoadingMessages && (
          <Typography variant="body2" sx={{ textAlign: 'center', color: 'var(--chat-muted)', py: 1, fontSize: 12.5 }}>
            Start of your conversation{isGroupRoom ? ` in ${title}` : ` with ${title}`}
          </Typography>
        )}

        {isLoadingMessages && messages.length === 0 && (
          <Box aria-label="Loading messages" sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, pt: 2 }}>
            {[220, 160, 260, 120, 200].map((w, i) => (
              <Box key={i} sx={{ display: 'flex', justifyContent: i % 2 ? 'flex-end' : 'flex-start', gap: 1 }}>
                {i % 2 === 0 && <Box className="chat-skeleton" sx={{ width: 32, height: 32, borderRadius: '50% !important' }} />}
                <Box className="chat-skeleton" sx={{ width: w, height: 38 }} />
              </Box>
            ))}
          </Box>
        )}

        {!isLoadingMessages && messages.length === 0 && (
          <Box sx={{ height: '100%', minHeight: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 1, px: 2 }}>
            <Avatar sx={{ width: 64, height: 64, fontSize: 22, fontWeight: 600, bgcolor: 'var(--ct-tone-violet-bg)', color: 'var(--ct-tone-violet-fg)' }}>
              {initialsOf(null, null, title)}
            </Avatar>
            <Typography sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 20, color: 'var(--chat-text)', mt: 1 }}>{title}</Typography>
            <Typography variant="body2" sx={{ color: 'var(--chat-muted)', maxWidth: 320 }}>
              No messages yet. Say hello to start the conversation.
            </Typography>
            <Button variant="outlined" onClick={onWave} sx={{ mt: 1, minHeight: 40 }} startIcon={<span style={{ fontFamily: EMOJI_FONT, fontSize: 18 }}>👋</span>}>
              Wave
            </Button>
          </Box>
        )}

        {layout.map(({ message: m, showDay, position }, index) => (
          <Fragment key={m.id}>
            {showDay && <div className="chat-day" role="separator"><span>{dayLabel(m.created_at)}</span></div>}
            {index === firstUnreadIndex && (
              <div className="chat-day" role="separator" aria-label="New messages">
                <span style={{ color: 'var(--ct-accent-strong)', borderColor: 'var(--ct-accent-strong)' }}>New messages</span>
              </div>
            )}
            <MessageBubble
              msg={m}
              isMe={isMessageFromMe(m)}
              isGroupRoom={isGroupRoom}
              position={position}
              {...bubbleActions}
              onRequestEdit={onRequestEdit}
              onRequestDelete={onRequestDelete}
              resolveMemberDetails={() => resolveMemberDetailsForMessage(m)}
              innerRef={(el) => registerMessage(m.id, el)}
            />
          </Fragment>
        ))}

        {typing && (
          <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, mt: 1.5 }} aria-hidden>
            <Box sx={{ width: 32 }} />
            <Box className="bubble" sx={{ py: '11px !important' }}>
              <span className="typing-dots"><i /><i /><i /></span>
            </Box>
          </Box>
        )}
      </Box>

      {showJump && (
        <Button
          onClick={onJumpToLatest}
          variant="contained"
          size="small"
          startIcon={<ArrowDown size={16} />}
          sx={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', borderRadius: '999px', minHeight: 36, px: 1.75, boxShadow: '0 6px 18px rgba(6, 18, 58, 0.18)', zIndex: 4 }}
        >
          {unseenCount > 0 ? `${unseenCount} new ${unseenCount === 1 ? 'message' : 'messages'}` : 'Latest messages'}
        </Button>
      )}
    </Box>
  );
}
