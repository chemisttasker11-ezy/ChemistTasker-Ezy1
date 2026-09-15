import { FC, useRef, useEffect, useState, useMemo, Fragment, UIEvent, useCallback } from 'react';
import { Box, IconButton, InputBase, Tooltip, Typography, CircularProgress, Divider, Chip, Paper, List, ListItemButton, ListItemText } from '@mui/material';
import { AlertColor } from '@mui/material/Alert';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import CancelIcon from '@mui/icons-material/Cancel';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage, ChatRoom, MemberCache, PharmacyRef, UserLite } from './types';
import './chat.css';
import PushPinIcon from '@mui/icons-material/PushPin';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

type Membership = {
  id: number;
  pharmacy: number;
  user: { id: number };
};

type ShiftContactUser = Omit<UserLite, 'first_name' | 'last_name' | 'email'> & {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

type MentionOption = { label: string; membershipId: number };
type MentionState = {
  options: MentionOption[];
  triggerIndex: number;
  caretIndex: number;
  activeIndex: number;
};

type Props = {
  activeRoom: ChatRoom;
  pharmacies: PharmacyRef[];
  myMemberships: Membership[];
  messages: ChatMessage[];
  myMembershipId?: number;
  currentUserId?: number;
  participantCache: Record<number, { details: UserLite; invited_name?: string }>;
  memberCache: MemberCache;
  shiftContacts?: Array<{ user?: ShiftContactUser | null }>;
  onSendText: (body: string) => void;
  onSendAttachment: (files: File[], body?: string) => void;
  isLoadingMessages: boolean;
  onStartDm: (partnerMembershipId: number) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onEditMessage: (messageId: number, newBody: string) => void;
  onDeleteMessage: (messageId: number) => void;
  onReact: (messageId: number, reaction: string) => void;
  onTogglePin: (target: 'conversation' | 'message', messageId?: number) => void;
  isMobile: boolean;
  onBack: () => void;
  onTyping: (isTyping: boolean) => void;
  onNotify: (severity: AlertColor, message: string) => void;
  typingMembers?: string[];
};

export const ConversationPanel: FC<Props> = ({
  activeRoom,
  pharmacies,
  myMemberships,
  messages,
  myMembershipId,
  currentUserId,
  participantCache,
  memberCache,
  shiftContacts = [],
  onSendText,
  onSendAttachment,
  isLoadingMessages,
  onStartDm,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onEditMessage,
  onDeleteMessage,
  onReact,
  isMobile,
  onBack,
  onTogglePin,
  onTyping,
  onNotify,
  typingMembers = [],

}) => {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollContext, setScrollContext] = useState({ loading: false, prevHeight: 0 });
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  
  const [attachments, setAttachments] = useState<File[]>([]);
  const [mentionState, setMentionState] = useState<MentionState | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const typingActiveRef = useRef(false);
  const typingTimerRef = useRef<number | null>(null);

  const handlePinnedJump = useCallback(() => {
    const pinnedId = activeRoom.pinned_message?.id;
    if (!pinnedId) return;
    const target = messageRefs.current[pinnedId];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeRoom?.pinned_message?.id]);

  const mentionOptions = useMemo<MentionOption[]>(() => {
    const map = new Map<number, string>();
    const participantIds = activeRoom.participant_ids || [];

    participantIds.forEach(membershipId => {
      if (myMembershipId && membershipId === myMembershipId) return;
      for (const pharmacyId in memberCache) {
        const record = memberCache[Number(pharmacyId)]?.[membershipId];
        if (record?.details) {
          const details = record.details;
          const label = `${details.first_name || ''} ${details.last_name || ''}`.trim() || details.email || `Member ${membershipId}`;
          map.set(membershipId, label);
          break;
        }
      }
    });

    messages.forEach(message => {
      const membershipId = message.sender?.id;
      if (!membershipId || (myMembershipId && membershipId === myMembershipId) || map.has(membershipId)) return;
      const details = message.sender?.user_details;
      if (details) {
        const label = `${details.first_name || ''} ${details.last_name || ''}`.trim() || details.email || `Member ${membershipId}`;
        map.set(membershipId, label);
      }
    });

    return Array.from(map.entries()).map(([membershipId, label]) => ({ membershipId, label }));
  }, [activeRoom, memberCache, messages, myMembershipId]);

  const resolveMemberDetails = useCallback(
    (membershipId: number | null): UserLite | null => {
      if (!membershipId) {
        return null;
      }
      const participant = participantCache[membershipId]?.details;
      if (participant) {
        return participant;
      }
      for (const pharmacyId in memberCache) {
        const record = memberCache[Number(pharmacyId)]?.[membershipId];
        if (record?.details) {
          return record.details;
        }
      }
      return null;
    },
    [memberCache, participantCache],
  );

  const resolveMemberDetailsForMessage = useCallback(
    (message: ChatMessage): UserLite | null => {
      const membershipId = message.sender?.id ?? null;
      const byMembership = resolveMemberDetails(membershipId);
      const senderUserId = message.sender?.user_details?.id;
      const hasUsefulMembershipDetails = Boolean(
        byMembership?.profile_photo_url ||
        `${byMembership?.first_name || ''} ${byMembership?.last_name || ''}`.trim()
      );
      if (hasUsefulMembershipDetails) {
        return byMembership;
      }
      if (senderUserId) {
        const shiftContact = shiftContacts.find((contact) => contact?.user?.id === senderUserId);
        if (shiftContact?.user) {
          return {
            ...byMembership,
            ...shiftContact.user,
            first_name: shiftContact.user.first_name || byMembership?.first_name,
            last_name: shiftContact.user.last_name || byMembership?.last_name,
            profile_photo_url: shiftContact.user.profile_photo_url || byMembership?.profile_photo_url,
          } as UserLite;
        }
        for (const cached of Object.values(participantCache)) {
          if (cached?.details?.id === senderUserId) {
            return cached.details;
          }
        }
        for (const pharmacyId in memberCache) {
          const inner = memberCache[Number(pharmacyId)];
          for (const rec of Object.values(inner)) {
            if (rec?.details?.id === senderUserId) {
              return rec.details;
            }
          }
        }
      }
      return byMembership;
    },
    [memberCache, participantCache, resolveMemberDetails, shiftContacts],
  );

  const isMessageFromMe = useCallback(
    (message: ChatMessage) => {
      if (myMembershipId && message.sender?.id === myMembershipId) {
        return true;
      }
      const senderUserId = message.sender?.user_details?.id;
      return Boolean(currentUserId && senderUserId && senderUserId === currentUserId);
    },
    [currentUserId, myMembershipId],
  );

  const updateMentionState = useCallback(
    (value: string, caretIndex: number) => {
      const textBeforeCaret = value.slice(0, caretIndex);
      const match = textBeforeCaret.match(/@([\p{L}\p{N}._-]*)$/u);
      if (!match) {
        setMentionState(null);
        return;
      }
      const triggerIndex = match.index ?? Math.max(0, caretIndex - match[0].length);
      const query = match[1].toLowerCase();
      const filtered = mentionOptions
        .filter(option => option.label.toLowerCase().includes(query))
        .slice(0, 8);
      if (filtered.length === 0) {
        setMentionState(null);
        return;
      }
      setMentionState({
        options: filtered,
        triggerIndex,
        caretIndex,
        activeIndex: 0,
      });
    },
    [mentionOptions]
  );

  const syncMentionState = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const value = input.value ?? '';
    const caret = input.selectionStart ?? value.length;
    updateMentionState(value, caret);
  }, [updateMentionState]);

  const scheduleTypingStop = useCallback(() => {
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = window.setTimeout(() => {
      if (typingActiveRef.current) {
        onTyping(false);
        typingActiveRef.current = false;
      }
      typingTimerRef.current = null;
    }, 2000);
  }, [onTyping]);

  const handleSend = useCallback(async () => {
    const body = text.trim();
    if ((!body && attachments.length === 0) || sending) return;

    setSending(true);
    try {
      if (attachments.length > 0) {
        await onSendAttachment(attachments, body || undefined);
      } else {
        await onSendText(body);
      }
      setText('');
      setAttachments([]);
      setMentionState(null);
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      if (typingActiveRef.current) {
        onTyping(false);
        typingActiveRef.current = false;
      }
      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    } catch (error) {
      console.error('Failed to send message', error);
      onNotify('error', 'Failed to send message.');
    } finally {
      setSending(false);
    }
  }, [text, attachments, sending, onSendAttachment, onSendText, onTyping, onNotify]);

  const handleMentionPick = useCallback(
    (option: MentionOption) => {
      if (!mentionState) return;
      const before = text.slice(0, mentionState.triggerIndex);
      const after = text.slice(mentionState.caretIndex);
      const insertion = `@${option.label} `;
      const nextValue = `${before}${insertion}${after}`;
      setText(nextValue);
      setMentionState(null);
      if (!typingActiveRef.current) {
        onTyping(true);
        typingActiveRef.current = true;
      }
      scheduleTypingStop();
      window.setTimeout(() => {
        const cursor = before.length + insertion.length;
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(cursor, cursor);
        }
      }, 0);
    },
    [mentionState, text, onTyping, scheduleTypingStop]
  );

  const handleComposerChange: React.ChangeEventHandler<HTMLTextAreaElement | HTMLInputElement> = useCallback(
    (event) => {
      const { value } = event.target;
      setText(value);
      const caret = event.target.selectionStart ?? value.length;
      updateMentionState(value, caret);
      if (value.trim().length > 0) {
        if (!typingActiveRef.current) {
          onTyping(true);
          typingActiveRef.current = true;
        }
        scheduleTypingStop();
      } else {
        if (typingActiveRef.current) {
          onTyping(false);
          typingActiveRef.current = false;
        }
        if (typingTimerRef.current) {
          window.clearTimeout(typingTimerRef.current);
          typingTimerRef.current = null;
        }
      }
    },
    [updateMentionState, onTyping, scheduleTypingStop]
  );

  const handleComposerKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement | HTMLInputElement> = useCallback(
    (event) => {
      if (mentionState && mentionState.options.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setMentionState(state => {
            if (!state) return state;
            const nextIndex = (state.activeIndex + 1) % state.options.length;
            return { ...state, activeIndex: nextIndex };
          });
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setMentionState(state => {
            if (!state) return state;
            const nextIndex = (state.activeIndex - 1 + state.options.length) % state.options.length;
            return { ...state, activeIndex: nextIndex };
          });
          return;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          const option = mentionState.options[mentionState.activeIndex] || mentionState.options[0];
          if (option) {
            handleMentionPick(option);
          }
          return;
        }
      }

      if (mentionState && event.key === 'Escape') {
        event.preventDefault();
        setMentionState(null);
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (typingActiveRef.current) {
          onTyping(false);
          typingActiveRef.current = false;
        }
        if (typingTimerRef.current) {
          window.clearTimeout(typingTimerRef.current);
          typingTimerRef.current = null;
        }
        handleSend();
        return;
      }
    },
    [mentionState, handleMentionPick, handleSend, onTyping]
  );

  const headerTitle = useMemo(() => {
    if (activeRoom.type === 'GROUP') {
        if (activeRoom.title) return activeRoom.title;
        // Fallback for old groups that are tied to a pharmacy
        const pharmacy = pharmacies.find(p => p.id === activeRoom.pharmacy);
        return pharmacy?.name || 'Group Chat';
    }
    // Logic for DM titles
// DM title logic
// Never trust a generic "Group Chat" string for DMs
if (
  activeRoom.title &&
  activeRoom.title !== 'Direct Message' &&
  !activeRoom.title.startsWith('DM between') &&
  !/^group\s*chat$/i.test(activeRoom.title)
) {
  return activeRoom.title;
}

const myMembershipInRoom = myMemberships.find(myMem => activeRoom.participant_ids?.includes(myMem.id));
if (!myMembershipInRoom) {
  return 'Direct Message';
}

const partnerMembershipId = activeRoom.participant_ids?.find(pId => pId !== myMembershipInRoom.id);
if (partnerMembershipId) {
  for (const pharmacyId in memberCache) {
    if (memberCache[pharmacyId][partnerMembershipId]) {
      const partnerUser = memberCache[pharmacyId][partnerMembershipId].details;
      const fullName = `${partnerUser.first_name || ''} ${partnerUser.last_name || ''}`.trim();
      return fullName || partnerUser.email || 'Direct Message';
    }
  }
}

// Fallback: infer from visible messages (when the partner participant row no longer exists)
const lastFromPartner = [...messages].reverse().find(m => m.sender?.id !== myMembershipInRoom.id)?.sender?.user_details;
if (lastFromPartner) {
  const fullName = `${lastFromPartner.first_name || ''} ${lastFromPartner.last_name || ''}`.trim();
  return fullName || lastFromPartner.email || 'Direct Message';
}

return 'Direct Message';
  }, [activeRoom, pharmacies, myMemberships, memberCache]);

  const firstUnreadIndex = useMemo(() => {
    const lastReadTime = activeRoom?.my_last_read_at ? dayjs.utc(activeRoom.my_last_read_at).valueOf() : 0;
    if (!lastReadTime) return -1;
    return messages.findIndex(msg =>
      (dayjs.utc(msg.created_at).valueOf() > lastReadTime) &&
      (msg.sender.user_details.id !== currentUserId)
    );
  }, [activeRoom?.my_last_read_at, messages, currentUserId]);
  messageRefs.current = {};
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      if (typingActiveRef.current) {
        onTyping(false);
        typingActiveRef.current = false;
      }
    };
  }, [onTyping]);
  
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    if (scrollContext.loading) {
      scroller.scrollTop = scroller.scrollHeight - scrollContext.prevHeight;
      setScrollContext({ loading: false, prevHeight: 0 });
    } else {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }, [messages, activeRoom.id, scrollContext]);
  
  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newAttachments: File[] = [];
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) { 
        onNotify('warning', `File "${file.name}" exceeds the 10 MB size limit.`);
        continue;
      }
      newAttachments.push(file);
    }
    setAttachments(prev => [...prev, ...newAttachments]);
    if (e.target) e.target.value = '';
  };

  const removeAttachment = (fileName: string) => {
    setAttachments(prev => prev.filter(f => f.name !== fileName));
  };
  
  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop === 0 && hasMore && !isLoadingMore) {
      if (scrollRef.current) {
        setScrollContext({ loading: true, prevHeight: scrollRef.current.scrollHeight });
      }
      onLoadMore();
    }
  };

  return (
    <Box className="chatpage-main" sx={{ position: 'relative' }}>
      <Box className="conversation-header" sx={{ position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.paper' }}>
        {isMobile && (
          <IconButton onClick={onBack} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={700} noWrap title={headerTitle}>
            {headerTitle}
          </Typography>
          {isLoadingMessages ? (
            <Typography variant="caption" color="text.secondary">Loading…</Typography>
          ) : null}
          {activeRoom.pinned_message && (
            <Box
              sx={{
                mt: 1,
                p: 1,
                borderRadius: 1,
                bgcolor: 'action.hover',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                cursor: 'pointer'
              }}
              role="button"
              tabIndex={0}
              onClick={handlePinnedJump}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handlePinnedJump();
                }
              }}
            >
              <PushPinIcon sx={{ color: 'text.secondary' }} fontSize="small" />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" fontWeight="bold" noWrap>
                  Pinned
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: '260px' }}>
                  {activeRoom.pinned_message.body || 'Attachment'}
                </Typography>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      <Box ref={scrollRef} className="conversation-scroll" onScroll={handleScroll}>
        {isLoadingMore && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {messages.map((m, index) => (
          <Fragment key={m.id}>
            {index === firstUnreadIndex && (
              <Divider sx={{ my: 2, '&::before, &::after': { borderColor: 'primary.light' } }}>
                <Chip label="New Messages" size="small" color="primary" variant="outlined" />
              </Divider>
            )}
            <MessageBubble
              msg={m}
              isMe={isMessageFromMe(m)}
              onStartDm={onStartDm}
              onEdit={onEditMessage}
              onDelete={onDeleteMessage}
              onReact={onReact}
              onTogglePin={onTogglePin}
              resolveMemberDetails={() => resolveMemberDetailsForMessage(m)}
              innerRef={(el) => {
                if (el) {
                  messageRefs.current[m.id] = el;
                } else {
                  delete messageRefs.current[m.id];
                }
              }}
            />
          </Fragment>
        ))}
        {typingMembers.length > 0 && (
          <Box sx={{ px: 2, py: 1, color: 'text.secondary', fontSize: '0.85rem' }}>
            {typingMembers.length === 1
              ? `${typingMembers[0]} is typing…`
              : `${typingMembers.slice(0, 3).join(', ')} ${typingMembers.length > 1 ? 'are' : 'is'} typing…`}
          </Box>
        )}
      </Box>
      
      {attachments.length > 0 && (
        <Box sx={{ p: 1, borderTop: '1px solid #e6e8ee', display: 'flex', flexDirection: 'column', gap: 1, bgcolor: 'background.default' }}>
          {attachments.map(file => (
            <Chip
              key={file.name}
              label={file.name}
              size="small"
              onDelete={() => removeAttachment(file.name)}
              deleteIcon={<CancelIcon onMouseDown={(e) => e.stopPropagation()} />}
            />
          ))}
        </Box>
      )}

      <Box className="conversation-footer">
        {mentionState && mentionState.options.length > 0 && (
          <Paper
            elevation={4}
            sx={{
              position: 'absolute',
              bottom: '100%',
              left: 8,
              right: 8,
              mb: 1,
              maxHeight: 220,
              overflowY: 'auto',
              zIndex: 5,
            }}
          >
            <List dense id="mention-suggestions">
              {mentionState.options.map((option, idx) => (
                <ListItemButton
                  key={option.membershipId}
                  selected={idx === mentionState.activeIndex}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleMentionPick(option);
                  }}
                >
                  <ListItemText primary={`@${option.label}`} />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        )}
        <Tooltip title="Attach">
          <span>
            <IconButton onClick={() => fileRef.current?.click()} size="small" disabled={sending}>
              <AttachFileOutlinedIcon />
            </IconButton>
          </span>
        </Tooltip>
        <input ref={fileRef} type="file" hidden multiple onChange={handleFileChange} />
        <InputBase
          value={text}
          onChange={handleComposerChange}
          placeholder="Type a message..."
          fullWidth
          multiline
          maxRows={4}
          sx={{ px: 1, py: 0.5 }}
          disabled={sending}
          onKeyDown={handleComposerKeyDown}
          onKeyUp={syncMentionState}
          onClick={syncMentionState}
          onBlur={() => {
            setMentionState(null);
            if (typingTimerRef.current) {
              window.clearTimeout(typingTimerRef.current);
              typingTimerRef.current = null;
            }
            if (typingActiveRef.current) {
              onTyping(false);
              typingActiveRef.current = false;
            }
          }}
          onFocus={syncMentionState}
          inputRef={inputRef}
          inputProps={{
            'aria-autocomplete': 'list',
            'aria-expanded': mentionState ? mentionState.options.length > 0 : undefined,
            'aria-controls': mentionState && mentionState.options.length > 0 ? 'mention-suggestions' : undefined,
          }}
        />
        <IconButton color="primary" onClick={handleSend} disabled={sending || (!text.trim() && attachments.length === 0)}>
          {sending ? <CircularProgress size={20} /> : <SendOutlinedIcon />}
        </IconButton>
      </Box>
    </Box>
  );
};
