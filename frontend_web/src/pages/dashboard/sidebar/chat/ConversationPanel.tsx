import { FC, useRef, useEffect, useState, useMemo, Fragment, UIEvent, useCallback, type ClipboardEvent, type DragEvent } from 'react';
import { Avatar, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputBase, Popover, Tooltip, Typography, CircularProgress, Paper, List, ListItemButton, ListItemText } from '@mui/material';
import { AlertColor } from '@mui/material/Alert';
import { AlertCircle, ArrowDown, ArrowLeft, FileText, Paperclip, Pencil, Pin, PinOff, SendHorizontal, Smile, X } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage, ChatRoom, MemberCache, PharmacyRef, UserLite } from './types';
import { COMPOSER_EMOJI, EMOJI_FONT, dayLabel, initialsOf, layoutMessages } from './chatFormat';
import './chat.css';
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
const ALL_MENTION_ID = -1;
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
  onSendText: (body: string) => void | Promise<void>;
  onSendAttachment: (files: File[], body?: string) => void | Promise<void>;
  isLoadingMessages: boolean;
  onStartDm: (partnerMembershipId: number) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onEditMessage: (messageId: number, newBody: string) => void | Promise<void>;
  onDeleteMessage: (messageId: number) => void | Promise<void>;
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
  const nearBottomRef = useRef(true);
  const lastMessageIdRef = useRef<number | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [draftBeforeEdit, setDraftBeforeEdit] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ChatMessage | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
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

    const people = Array.from(map.entries()).map(([membershipId, label]) => ({ membershipId, label }));
    // Group chats offer @all first. Every group participant is already notified of each message
    // (backend chat/signals.py); @all tells them the message is meant for everyone.
    return activeRoom.type === 'GROUP' ? [{ membershipId: ALL_MENTION_ID, label: 'all' }, ...people] : people;
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
    if (editing) {
      if (!body || sending) return;
      setSending(true);
      setSendError(null);
      try {
        if (body !== editing.body) await onEditMessage(editing.id, body);
        setEditing(null);
        setText(draftBeforeEdit);
        setDraftBeforeEdit('');
      } catch {
        setSendError("Your edit wasn't saved. Check your connection and try again.");
      } finally {
        setSending(false);
      }
      return;
    }
    if ((!body && attachments.length === 0) || sending) return;
    setSending(true);
    setSendError(null);
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
      setSendError("Message not sent. It's still in the box below, so you can try again.");
    } finally {
      setSending(false);
    }
  }, [text, attachments, sending, editing, draftBeforeEdit, onEditMessage, onSendAttachment, onSendText, onTyping]);

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
      if (editing && event.key === 'Escape') {
        event.preventDefault();
        setEditing(null);
        setText(draftBeforeEdit);
        setDraftBeforeEdit('');
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
    [mentionState, handleMentionPick, handleSend, onTyping, editing, draftBeforeEdit]
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
  }, [activeRoom, pharmacies, myMemberships, memberCache, messages]);

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
  
  const resolveUserName = useCallback(
    (userId: number): string | null => {
      const fromDetails = (d?: UserLite | null) => (d ? `${d.first_name || ''} ${d.last_name || ''}`.trim() || d.email || null : null);
      for (const cached of Object.values(participantCache)) {
        if (cached?.details?.id === userId) return fromDetails(cached.details);
      }
      for (const pharmacyId in memberCache) {
        for (const rec of Object.values(memberCache[Number(pharmacyId)] || {})) {
          if (rec?.details?.id === userId) return fromDetails(rec.details);
        }
      }
      const fromMessages = messages.find((m) => m.sender?.user_details?.id === userId)?.sender?.user_details;
      return fromDetails(fromMessages);
    },
    [participantCache, memberCache, messages],
  );

  const layout = useMemo(() => layoutMessages(messages), [messages]);
  const isGroupRoom = activeRoom.type === 'GROUP';
  const memberCount = activeRoom.participant_ids?.length || 0;
  const typingLine = typingMembers.length === 0
    ? null
    : typingMembers.length === 1
      ? `${typingMembers[0]} is typing…`
      : typingMembers.length === 2
        ? `${typingMembers[0]} and ${typingMembers[1]} are typing…`
        : `${typingMembers.length} people are typing…`;

  const scrollToBottom = useCallback((smooth = false) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    nearBottomRef.current = true;
    setShowJump(false);
    setUnseenCount(0);
  }, []);

  // New room: start at the latest message, with a clean composer.
  useEffect(() => {
    lastMessageIdRef.current = null;
    nearBottomRef.current = true;
    setShowJump(false);
    setUnseenCount(0);
    setEditing(null);
    setSendError(null);
  }, [activeRoom.id]);

  // Keep position when older messages load; follow new ones only if the reader is already at the bottom.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (scrollContext.loading) {
      scroller.scrollTop = scroller.scrollHeight - scrollContext.prevHeight;
      setScrollContext({ loading: false, prevHeight: 0 });
      return;
    }
    const latest = messages[messages.length - 1];
    const previousLatest = lastMessageIdRef.current;
    lastMessageIdRef.current = latest?.id ?? null;
    if (previousLatest === null) {
      scroller.scrollTop = scroller.scrollHeight;
      return;
    }
    if (!latest || latest.id === previousLatest) return;
    if (nearBottomRef.current || isMessageFromMe(latest)) {
      scrollToBottom(true);
    } else {
      setUnseenCount((count) => count + 1);
      setShowJump(true);
    }
  }, [messages, scrollContext, isMessageFromMe, scrollToBottom]);

  // Typing bubble appears at the bottom: keep it in view when the reader is there.
  useEffect(() => {
    if (typingMembers.length && nearBottomRef.current) scrollToBottom(true);
  }, [typingMembers.length, scrollToBottom]);

  const addFiles = (files: File[]) => {
    const accepted: File[] = [];
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        onNotify('warning', `"${file.name}" is over the 10 MB limit.`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length) {
      setAttachments((prev) => [...prev, ...accepted.filter((f) => !prev.some((p) => p.name === f.name))]);
      setSendError(null);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    addFiles(Array.from(e.target.files || []));
    if (e.target) e.target.value = '';
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData?.files || []);
    if (files.length) {
      event.preventDefault();
      addFiles(files);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (editing) return;
    addFiles(Array.from(event.dataTransfer?.files || []));
  };

  const removeAttachment = (fileName: string) => {
    setAttachments(prev => prev.filter(f => f.name !== fileName));
  };

  const attachmentPreviews = useMemo(
    () => attachments.map((file) => ({ file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null })),
    [attachments],
  );
  useEffect(() => () => attachmentPreviews.forEach((p) => p.url && URL.revokeObjectURL(p.url)), [attachmentPreviews]);

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottomRef.current = distance < 120;
    if (nearBottomRef.current) {
      if (showJump) setShowJump(false);
      if (unseenCount) setUnseenCount(0);
    } else if (distance > 400 && !showJump) {
      setShowJump(true);
    }
    if (el.scrollTop < 40 && hasMore && !isLoadingMore) {
      setScrollContext({ loading: true, prevHeight: el.scrollHeight });
      onLoadMore();
    }
  };

  const startEdit = (message: ChatMessage) => {
    setDraftBeforeEdit(text);
    setEditing(message);
    setText(message.body || '');
    setAttachments([]);
    setSendError(null);
    window.setTimeout(() => {
      const input = inputRef.current;
      if (input) {
        input.focus();
        const end = input.value.length;
        input.setSelectionRange(end, end);
      }
    }, 0);
  };

  const cancelEdit = () => {
    setEditing(null);
    setText(draftBeforeEdit);
    setDraftBeforeEdit('');
    setSendError(null);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await onDeleteMessage(deleting.id);
      setDeleting(null);
    } catch {
      onNotify('error', "We couldn't delete that message. Try again.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const insertEmoji = (emoji: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
    setText(next);
    setEmojiAnchor(null);
    window.setTimeout(() => {
      if (input) {
        input.focus();
        const caret = start + emoji.length;
        input.setSelectionRange(caret, caret);
      }
    }, 0);
  };

  const canSend = !sending && (editing ? Boolean(text.trim()) : Boolean(text.trim() || attachments.length));
  const placeholder = editing ? 'Edit your message' : isMobile ? 'Message' : `Message ${isGroupRoom ? headerTitle : headerTitle.split(' ')[0]}`;
  const pinned = activeRoom.pinned_message;

  return (
    <Box
      className="chatpage-main"
      sx={{ position: 'relative' }}
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); if (!dragActive) setDragActive(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragActive(false); }}
      onDrop={handleDrop}
    >
      {dragActive && <div className="conversation-dropzone">Drop files to attach</div>}

      <Box className="conversation-header" sx={{ position: 'sticky', top: 0, zIndex: 2, gap: 1.25 }}>
        {isMobile && (
          <IconButton onClick={onBack} aria-label="Back to conversations" sx={{ width: 40, height: 40, ml: -0.5 }}>
            <ArrowLeft size={20} />
          </IconButton>
        )}
        <Avatar sx={{ width: 40, height: 40, fontSize: 14, fontWeight: 600, bgcolor: 'var(--ct-tone-violet-bg)', color: 'var(--ct-tone-violet-fg)' }}>
          {initialsOf(null, null, headerTitle)}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography component="h2" noWrap title={headerTitle} sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 18, lineHeight: 1.25, color: 'var(--chat-text)' }}>
            {headerTitle}
          </Typography>
          <Typography variant="body2" noWrap aria-live="polite" sx={{ color: typingLine ? 'var(--ct-accent-strong)' : 'var(--chat-muted)', fontSize: 13 }}>
            {typingLine || (isLoadingMessages ? 'Loading messages…' : isGroupRoom ? `Group · ${memberCount} ${memberCount === 1 ? 'member' : 'members'}` : 'Direct message')}
          </Typography>
        </Box>
        <Tooltip title={activeRoom.is_pinned ? 'Unpin conversation' : 'Pin conversation'}>
          <IconButton
            aria-label={activeRoom.is_pinned ? 'Unpin conversation' : 'Pin conversation'}
            aria-pressed={activeRoom.is_pinned}
            onClick={() => onTogglePin('conversation')}
            sx={{ width: 40, height: 40, color: activeRoom.is_pinned ? 'var(--ct-accent-strong)' : 'var(--chat-muted)' }}
          >
            <Pin size={18} />
          </IconButton>
        </Tooltip>
      </Box>

      {pinned && (
        <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1, borderBottom: '1px solid var(--chat-border)', bgcolor: 'var(--chat-surface)' }}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 1, borderRadius: '12px', bgcolor: 'var(--ct-tone-violet-bg)', border: '1px solid color-mix(in srgb, var(--ct-accent-strong) 18%, transparent)' }}
          >
            <Box sx={{ color: 'var(--ct-accent-strong)', display: 'flex' }} aria-hidden><Pin size={16} /></Box>
            <Box
              role="button"
              tabIndex={0}
              onClick={handlePinnedJump}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePinnedJump(); } }}
              sx={{ minWidth: 0, flex: 1, cursor: 'pointer', borderRadius: '8px', '&:focus-visible': { outline: '2px solid var(--ct-accent-strong)', outlineOffset: 2 } }}
              aria-label="Go to pinned message"
            >
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--ct-accent-strong)', fontSize: 12.5 }}>Pinned message</Typography>
              <Typography variant="body2" noWrap sx={{ color: 'var(--chat-text)' }}>{pinned.body || 'Attachment'}</Typography>
            </Box>
            <Tooltip title="Unpin message">
              <IconButton aria-label="Unpin message" onClick={() => onTogglePin('message', pinned.id)} sx={{ width: 36, height: 36, color: 'var(--ct-accent-strong)' }}>
                <PinOff size={16} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      )}

      <Box sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Box ref={scrollRef} className="conversation-scroll" onScroll={handleScroll} role="log" aria-live="polite" aria-relevant="additions" aria-label={`Messages in ${headerTitle}`}>
          {isLoadingMore && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderRadius: '999px', bgcolor: 'var(--chat-surface)', border: '1px solid var(--chat-border)', fontSize: 12.5, color: 'var(--chat-muted)' }}>
                <CircularProgress size={14} /> Loading earlier messages
              </Box>
            </Box>
          )}
          {!hasMore && messages.length > 0 && !isLoadingMessages && (
            <Typography variant="body2" sx={{ textAlign: 'center', color: 'var(--chat-muted)', py: 1, fontSize: 12.5 }}>
              Start of your conversation{isGroupRoom ? ` in ${headerTitle}` : ` with ${headerTitle}`}
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
                {initialsOf(null, null, headerTitle)}
              </Avatar>
              <Typography sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 20, color: 'var(--chat-text)', mt: 1 }}>{headerTitle}</Typography>
              <Typography variant="body2" sx={{ color: 'var(--chat-muted)', maxWidth: 320 }}>
                No messages yet. Say hello to start the conversation.
              </Typography>
              <Button variant="outlined" onClick={() => { void onSendText('👋'); }} sx={{ mt: 1, minHeight: 40 }} startIcon={<span style={{ fontFamily: EMOJI_FONT, fontSize: 18 }}>👋</span>}>
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
                currentUserId={currentUserId}
                onStartDm={onStartDm}
                onRequestEdit={startEdit}
                onRequestDelete={setDeleting}
                onReact={onReact}
                onTogglePin={onTogglePin}
                resolveMemberDetails={() => resolveMemberDetailsForMessage(m)}
                resolveUserName={resolveUserName}
                innerRef={(el) => {
                  if (el) messageRefs.current[m.id] = el;
                  else delete messageRefs.current[m.id];
                }}
              />
            </Fragment>
          ))}

          {typingMembers.length > 0 && (
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
            onClick={() => scrollToBottom(true)}
            variant="contained"
            size="small"
            startIcon={<ArrowDown size={16} />}
            sx={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', borderRadius: '999px', minHeight: 36, px: 1.75, boxShadow: '0 6px 18px rgba(6, 18, 58, 0.18)', zIndex: 4 }}
          >
            {unseenCount > 0 ? `${unseenCount} new ${unseenCount === 1 ? 'message' : 'messages'}` : 'Latest messages'}
          </Button>
        )}
      </Box>

      {(editing || sendError) && (
        <Box sx={{ px: 1.5, pt: 1, bgcolor: 'var(--chat-surface)', borderTop: '1px solid var(--chat-border)' }}>
          {editing && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.75, borderRadius: '10px', bgcolor: 'var(--chat-canvas)', borderLeft: '3px solid var(--ct-accent-strong)' }}>
              <Pencil size={15} color="var(--ct-accent-strong)" aria-hidden />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--chat-text)', fontSize: 13 }}>Editing message</Typography>
                <Typography variant="body2" noWrap sx={{ color: 'var(--chat-muted)', fontSize: 12.5 }}>{editing.body}</Typography>
              </Box>
              <Typography variant="caption" sx={{ color: 'var(--chat-muted)', display: { xs: 'none', sm: 'block' } }}>Esc to cancel</Typography>
              <IconButton aria-label="Cancel editing" onClick={cancelEdit} sx={{ width: 32, height: 32 }}><X size={16} /></IconButton>
            </Box>
          )}
          {sendError && (
            <Box role="alert" sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: editing ? 1 : 0, px: 1.25, py: 0.75, borderRadius: '10px', bgcolor: 'var(--ct-status-red-bg)', color: 'var(--ct-status-red-fg)' }}>
              <AlertCircle size={16} aria-hidden />
              <Typography variant="body2" sx={{ flex: 1, fontSize: 13, color: 'inherit' }}>{sendError}</Typography>
              <Button size="small" color="inherit" onClick={() => void handleSend()} disabled={sending} sx={{ fontWeight: 600, minHeight: 32 }}>Try again</Button>
              <IconButton aria-label="Dismiss" onClick={() => setSendError(null)} sx={{ width: 32, height: 32, color: 'inherit' }}><X size={15} /></IconButton>
            </Box>
          )}
        </Box>
      )}

      {attachmentPreviews.length > 0 && (
        <Box sx={{ px: 1.5, pt: 1, display: 'flex', gap: 1, flexWrap: 'wrap', bgcolor: 'var(--chat-surface)', borderTop: editing || sendError ? 'none' : '1px solid var(--chat-border)' }} aria-label="Attachments to send">
          {attachmentPreviews.map(({ file, url }) => (
            <Box key={file.name} sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 1, height: 64, pr: url ? 0 : 1.25, pl: url ? 0 : 1, maxWidth: 240, borderRadius: '12px', border: '1px solid var(--chat-border)', bgcolor: 'var(--chat-canvas)', overflow: 'hidden' }}>
              {url ? (
                <img src={url} alt={file.name} style={{ width: 64, height: 64, objectFit: 'cover', display: 'block' }} />
              ) : (
                <>
                  <FileText size={20} color="var(--ct-accent-strong)" aria-hidden />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600, color: 'var(--chat-text)', fontSize: 13 }}>{file.name}</Typography>
                    <Typography variant="caption" sx={{ color: 'var(--chat-muted)' }}>{Math.max(1, Math.round(file.size / 1024))} KB</Typography>
                  </Box>
                </>
              )}
              <IconButton
                aria-label={`Remove ${file.name}`}
                onClick={() => removeAttachment(file.name)}
                sx={{ position: url ? 'absolute' : 'static', top: 2, right: 2, width: 26, height: 26, bgcolor: 'rgba(6,18,58,0.72)', color: '#fff', '&:hover': { bgcolor: 'rgba(6,18,58,0.9)' } }}
              >
                <X size={14} />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}

      <Box className="conversation-footer" onPaste={handlePaste}>
        {mentionState && mentionState.options.length > 0 && (
          <Paper
            elevation={4}
            sx={{ position: 'absolute', bottom: '100%', left: 8, right: 8, mb: 1, maxHeight: 220, overflowY: 'auto', zIndex: 5, borderRadius: '12px' }}
          >
            <List dense id="mention-suggestions" role="listbox">
              {mentionState.options.map((option, idx) => (
                <ListItemButton
                  key={option.membershipId}
                  selected={idx === mentionState.activeIndex}
                  role="option"
                  aria-selected={idx === mentionState.activeIndex}
                  onMouseDown={(event) => { event.preventDefault(); handleMentionPick(option); }}
                >
                  <Avatar sx={{ width: 28, height: 28, mr: 1.25, fontSize: 11, fontWeight: 600, bgcolor: option.membershipId === ALL_MENTION_ID ? 'var(--ct-accent-strong)' : 'var(--ct-tone-violet-bg)', color: option.membershipId === ALL_MENTION_ID ? '#fff' : 'var(--ct-tone-violet-fg)' }}>
                    {option.membershipId === ALL_MENTION_ID ? '@' : initialsOf(null, null, option.label)}
                  </Avatar>
                  {option.membershipId === ALL_MENTION_ID ? (
                    <ListItemText primary="@all" secondary={`Everyone in ${headerTitle} (${Math.max(0, memberCount - 1)})`} />
                  ) : (
                    <ListItemText primary={option.label} />
                  )}
                </ListItemButton>
              ))}
            </List>
          </Paper>
        )}
        {!editing && (
          <Tooltip title="Attach files or photos">
            <span>
              <IconButton onClick={() => fileRef.current?.click()} disabled={sending} aria-label="Attach files or photos" sx={{ width: 40, height: 40, color: 'var(--ct-accent-strong)' }}>
                <Paperclip size={19} />
              </IconButton>
            </span>
          </Tooltip>
        )}
        <input ref={fileRef} type="file" hidden multiple onChange={handleFileChange} />
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-end', borderRadius: '20px', bgcolor: 'var(--chat-canvas)', border: '1px solid var(--chat-border)', '&:focus-within': { borderColor: 'var(--ct-accent-strong)', bgcolor: 'var(--chat-surface)' } }}>
          <InputBase
            value={text}
            onChange={handleComposerChange}
            placeholder={placeholder}
            fullWidth
            multiline
            maxRows={6}
            sx={{ px: 1.75, py: 1.1, fontSize: 15, lineHeight: 1.4 }}
            disabled={sending && !editing}
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
              'aria-label': editing ? 'Edit message' : 'Message',
              'aria-autocomplete': 'list',
              'aria-expanded': mentionState ? mentionState.options.length > 0 : undefined,
              'aria-controls': mentionState && mentionState.options.length > 0 ? 'mention-suggestions' : undefined,
            }}
          />
          <Tooltip title="Emoji">
            <IconButton aria-label="Insert emoji" onClick={(e) => setEmojiAnchor(e.currentTarget)} sx={{ width: 40, height: 40, mr: 0.25, mb: 0.1, color: 'var(--chat-muted)', '&:hover': { color: 'var(--ct-accent-strong)' } }}>
              <Smile size={19} />
            </IconButton>
          </Tooltip>
        </Box>
        <Tooltip title={editing ? 'Save edit (Enter)' : 'Send (Enter) · New line (Shift + Enter)'}>
          <span>
            <IconButton
              onClick={() => void handleSend()}
              disabled={!canSend}
              aria-label={sending ? 'Sending' : editing ? 'Save edit' : 'Send message'}
              sx={{ width: 44, height: 44, borderRadius: '14px', bgcolor: 'var(--chat-me)', color: '#fff', '&:hover': { bgcolor: '#2E1287' }, '&.Mui-disabled': { bgcolor: 'var(--chat-canvas)', color: 'var(--ct-text-muted)' } }}
            >
              {sending ? <CircularProgress size={18} color="inherit" /> : editing ? <Pencil size={18} /> : <SendHorizontal size={19} />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Popover
        open={Boolean(emojiAnchor)}
        anchorEl={emojiAnchor}
        onClose={() => setEmojiAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        slotProps={{ paper: { sx: { borderRadius: '16px', p: 1, mb: 1 } } }}
      >
        <Box role="group" aria-label="Emoji" sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 40px)', gap: 0.25 }}>
          {COMPOSER_EMOJI.map((emoji) => (
            <IconButton key={emoji} aria-label={`Insert ${emoji}`} onClick={() => insertEmoji(emoji)} sx={{ width: 40, height: 40, fontSize: 22, fontFamily: EMOJI_FONT }}>
              {emoji}
            </IconButton>
          ))}
        </Box>
      </Popover>

      <Dialog open={Boolean(deleting)} onClose={deleteBusy ? undefined : () => setDeleting(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete this message?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Everyone in this conversation will see “This message was deleted”. You can't undo this.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleting(null)} disabled={deleteBusy}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => void confirmDelete()} disabled={deleteBusy} startIcon={deleteBusy ? <CircularProgress size={16} color="inherit" /> : undefined}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
